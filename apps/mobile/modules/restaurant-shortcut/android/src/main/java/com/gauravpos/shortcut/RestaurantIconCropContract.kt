package com.gauravpos.shortcut

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.os.Bundle
import android.util.Base64
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import com.canhub.cropper.CropImage
import com.canhub.cropper.CropImageOptions
import com.canhub.cropper.CropImageView
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.Serializable
import kotlin.math.roundToInt

internal data class IconCropInput(
  val path: String,
  val width: Int,
  val height: Int,
  val initialLeft: Int?,
  val initialTop: Int?,
  val initialRight: Int?,
  val initialBottom: Int?,
) : Serializable

internal data class IconCropResult(val rectangle: Rect? = null, val error: String? = null)

internal class RestaurantIconCropContract : AppContextActivityResultContract<IconCropInput, IconCropResult?> {
  override fun createIntent(context: Context, input: IconCropInput): Intent {
    val options = CropImageOptions().apply {
      fixAspectRatio = true
      aspectRatioX = 1
      aspectRatioY = 1
      cropShape = CropImageView.CropShape.OVAL
      multiTouchEnabled = true
      maxZoom = 10
      allowRotation = false
      allowFlipping = false
      noOutputImage = true
      minCropResultWidth = 1
      minCropResultHeight = 1
      activityTitle = "App icon"
      cropMenuCropButtonTitle = "Use crop"
      toolbarColor = android.graphics.Color.rgb(35, 32, 28)
      toolbarTitleColor = android.graphics.Color.WHITE
      toolbarBackButtonColor = android.graphics.Color.WHITE
      activityMenuIconColor = android.graphics.Color.WHITE
      activityMenuTextColor = android.graphics.Color.WHITE
      if (input.initialLeft != null) {
        initialCropWindowRectangle = Rect(input.initialLeft, input.initialTop!!, input.initialRight!!, input.initialBottom!!)
      }
    }
    val source = FileProvider.getUriForFile(context, "${context.packageName}.ImagePickerFileProvider", File(input.path))
    return Intent().setClassName(context, "expo.modules.imagepicker.ExpoCropImageActivity").apply {
      putExtra(CropImage.CROP_IMAGE_EXTRA_BUNDLE, Bundle().apply {
        putParcelable(CropImage.CROP_IMAGE_EXTRA_SOURCE, source)
        putParcelable(CropImage.CROP_IMAGE_EXTRA_OPTIONS, options)
      })
    }
  }

  override fun parseResult(input: IconCropInput, resultCode: Int, intent: Intent?): IconCropResult? {
    if (resultCode == Activity.RESULT_CANCELED) return null
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent?.getParcelableExtra(CropImage.CROP_IMAGE_EXTRA_RESULT, CropImage.ActivityResult::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent?.getParcelableExtra<CropImage.ActivityResult>(CropImage.CROP_IMAGE_EXTRA_RESULT)
    }
    if (resultCode != Activity.RESULT_OK || result?.error != null) {
      return IconCropResult(error = "The icon could not be cropped. Try another image.")
    }
    val rect = result?.cropRect
    if (rect == null || rect.width() <= 0 || rect.height() <= 0 || rect.left < 0 || rect.top < 0 || rect.right > input.width || rect.bottom > input.height) {
      return IconCropResult(error = "The icon crop is outside the image.")
    }
    return IconCropResult(rectangle = rect)
  }
}

internal fun prepareIconCrop(context: Context, source: String, initial: Map<String, Double>?): IconCropInput {
  require(source.length <= 3_000_000 && Regex("^data:image/(png|jpeg);base64,").containsMatchIn(source)) {
    "Choose a PNG or JPG logo smaller than 2 MB."
  }
  val bytes = Base64.decode(source.substringAfter(','), Base64.DEFAULT)
  val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
  require(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 16_000_000L) {
    "Choose a logo up to 16 megapixels."
  }
  val decoded = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size)) { "The logo could not be read." }
  val orientation = ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
  val matrix = Matrix().apply {
    when (orientation) {
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> setScale(-1f, 1f)
      ExifInterface.ORIENTATION_ROTATE_180 -> setRotate(180f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> setScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> setValues(floatArrayOf(0f, 1f, 0f, 1f, 0f, 0f, 0f, 0f, 1f))
      ExifInterface.ORIENTATION_ROTATE_90 -> setRotate(90f)
      ExifInterface.ORIENTATION_TRANSVERSE -> setValues(floatArrayOf(0f, -1f, 0f, -1f, 0f, 0f, 0f, 0f, 1f))
      ExifInterface.ORIENTATION_ROTATE_270 -> setRotate(270f)
    }
  }
  val image = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
  if (image !== decoded) decoded.recycle()
  val file = File.createTempFile("restaurant-icon-", ".png", context.cacheDir)
  try {
    file.outputStream().use { check(image.compress(Bitmap.CompressFormat.PNG, 100, it)) }
    val rect = initial?.let { fractionCrop(it, image.width, image.height) }
    return IconCropInput(file.path, image.width, image.height, rect?.left, rect?.top, rect?.right, rect?.bottom)
  } catch (error: Exception) {
    file.delete()
    throw error
  } finally {
    image.recycle()
  }
}

private fun fractionCrop(crop: Map<String, Double>, width: Int, height: Int): Rect {
  val x = requireNotNull(crop["x"])
  val y = requireNotNull(crop["y"])
  val w = requireNotNull(crop["width"])
  val h = requireNotNull(crop["height"])
  require(listOf(x, y, w, h).all { it.isFinite() } && x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.000001 && y + h <= 1.000001) {
    "The saved icon crop is invalid."
  }
  val left = (x * width).roundToInt().coerceIn(0, width - 1)
  val top = (y * height).roundToInt().coerceIn(0, height - 1)
  val right = ((x + w) * width).roundToInt().coerceIn(left + 1, width)
  val bottom = ((y + h) * height).roundToInt().coerceIn(top + 1, height)
  return Rect(left, top, right, bottom)
}

internal fun iconCropResponse(input: IconCropInput, result: IconCropResult): Map<String, Any> {
  result.error?.let { throw IllegalStateException(it) }
  val rect = requireNotNull(result.rectangle)
  val image = requireNotNull(BitmapFactory.decodeFile(input.path)) { "The logo could not be read." }
  val preview = Bitmap.createBitmap(512, 512, Bitmap.Config.ARGB_8888)
  try {
    Canvas(preview).drawBitmap(image, rect, RectF(0f, 0f, 512f, 512f), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    val bytes = ByteArrayOutputStream().use {
      check(preview.compress(Bitmap.CompressFormat.PNG, 100, it))
      it.toByteArray()
    }
    return mapOf(
      "crop" to mapOf(
        "x" to rect.left.toDouble() / input.width,
        "y" to rect.top.toDouble() / input.height,
        "width" to rect.width().toDouble() / input.width,
        "height" to rect.height().toDouble() / input.height,
      ),
      "previewImageDataUrl" to "data:image/png;base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}",
    )
  } finally {
    image.recycle()
    preview.recycle()
  }
}
