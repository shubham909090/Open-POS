package com.gauravpos.shortcut

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

private const val SHORTCUT_ID = "restaurant-service"
private const val MAX_IMAGE_PIXELS = 16_000_000L
private const val MAX_IMAGE_DATA_LENGTH = 3_000_000

class RestaurantShortcutModule : Module() {
  private lateinit var iconCropLauncher: AppContextActivityResultLauncher<IconCropInput, IconCropResult?>
  private val croppingIcon = AtomicBoolean(false)
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("RestaurantShortcut")

    Function("isSupported") {
      shortcutManager()?.isRequestPinShortcutSupported == true
    }

    RegisterActivityContracts {
      iconCropLauncher = registerForActivityResult(RestaurantIconCropContract()) { input, _ ->
        // The fallback runs when the calling activity was destroyed during editing.
        File(input.path).delete()
      }
    }

    AsyncFunction("cropIcon") Coroutine { source: String, initialCrop: Map<String, Double>? ->
      check(croppingIcon.compareAndSet(false, true)) { "Finish the current icon crop first." }
      var input: IconCropInput? = null
      try {
        val prepared = withContext(Dispatchers.IO) { prepareIconCrop(context, source, initialCrop) }
        input = prepared
        val result = iconCropLauncher.launch(prepared) ?: return@Coroutine null
        withContext(Dispatchers.IO) { iconCropResponse(prepared, result) }
      } finally {
        input?.let { File(it.path).delete() }
        croppingIcon.set(false)
      }
    }

    AsyncFunction("request") { name: String, logoImageDataUrl: String? ->
      val manager = shortcutManager()
      if (manager == null || !manager.isRequestPinShortcutSupported) {
        return@AsyncFunction "unsupported"
      }
      val shortcut = createShortcut(manager, name, logoImageDataUrl)
      if (manager.pinnedShortcuts.any { it.id == SHORTCUT_ID }) {
        check(manager.updateShortcuts(listOf(shortcut))) { "Android could not refresh the shortcut. Try again." }
        "updated"
      } else if (manager.requestPinShortcut(shortcut, null)) {
        // Android sends no response when the user dismisses the confirmation.
        "requested"
      } else {
        "unsupported"
      }
    }

    AsyncFunction("update") { name: String, logoImageDataUrl: String? ->
      val manager = shortcutManager() ?: return@AsyncFunction false
      if (manager.pinnedShortcuts.none { it.id == SHORTCUT_ID }) return@AsyncFunction false
      manager.updateShortcuts(listOf(createShortcut(manager, name, logoImageDataUrl)))
    }
  }

  private fun shortcutManager(): ShortcutManager? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
    return context.getSystemService(ShortcutManager::class.java)
  }

  private fun createShortcut(manager: ShortcutManager, name: String, logoImageDataUrl: String?): ShortcutInfo {
    val label = name.trim().ifEmpty { "Restaurant" }.take(160)
    val intent = checkNotNull(context.packageManager.getLaunchIntentForPackage(context.packageName)) {
      "The app's launch activity is unavailable."
    }.apply {
      action = Intent.ACTION_VIEW
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val iconSize = minOf(manager.iconMaxWidth, manager.iconMaxHeight, 512).coerceAtLeast(48)
    return ShortcutInfo.Builder(context, SHORTCUT_ID)
      .setShortLabel(label)
      .setLongLabel(label)
      .setActivity(checkNotNull(intent.component))
      .setIntent(intent)
      .setIcon(Icon.createWithBitmap(createIcon(label, logoImageDataUrl, iconSize)))
      .build()
  }

  private fun createIcon(name: String, logoImageDataUrl: String?, size: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.WHITE)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    if (logoImageDataUrl != null) {
      val image = decodeLogo(logoImageDataUrl, size)
      try {
        val available = size.toFloat()
        val scale = minOf(available / image.width, available / image.height)
        val width = image.width * scale
        val height = image.height * scale
        val left = (size - width) / 2
        val top = (size - height) / 2
        canvas.drawBitmap(image, null, RectF(left, top, left + width, top + height), paint)
      } finally {
        image.recycle()
      }
    } else {
      val initial = String(Character.toChars(name.codePointAt(0))).uppercase()
      paint.color = Color.rgb(35, 32, 28)
      paint.typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      paint.textAlign = Paint.Align.CENTER
      paint.textSize = size * 0.48f
      val baseline = size / 2f - (paint.ascent() + paint.descent()) / 2
      canvas.drawText(initial, size / 2f, baseline, paint)
    }
    return bitmap
  }

  private fun decodeLogo(dataUrl: String, iconSize: Int): Bitmap {
    require(dataUrl.length <= MAX_IMAGE_DATA_LENGTH && dataUrl.startsWith("data:image/png;base64,")) {
      "The saved restaurant logo is invalid. Save a PNG logo and try again."
    }
    val bytes = Base64.decode(dataUrl.substringAfter(','), Base64.DEFAULT)
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    require(options.outWidth > 0 && options.outHeight > 0 && options.outWidth.toLong() * options.outHeight <= MAX_IMAGE_PIXELS) {
      "The saved restaurant logo could not be read."
    }
    options.inJustDecodeBounds = false
    options.inSampleSize = 1
    while (maxOf(options.outWidth, options.outHeight) / options.inSampleSize > iconSize * 2) {
      options.inSampleSize *= 2
    }
    return requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)) {
      "The saved restaurant logo could not be read."
    }
  }
}
