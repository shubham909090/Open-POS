import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { formatInr } from "@gaurav-pos/shared";
import { Pencil, Plus, X } from "lucide-react";
import { hubApi, type AlcoholCatalog, type Bootstrap, type CsvImportResult } from "../../hub-api.js";
import { type NoticeSetter, messageOf, rupeesToPaise } from "../../lib/format.js";
import { CsvImportBox } from "../ui/csv-import-box.js";
import { AlcoholEditForm } from "./alcohol-edit-form.js";

const PLAIN_LIQUOR_IMPORT_TEMPLATE = [
  "name,bar_counter,large_bottle_ml,small_bottle_ml,sealed_large_count,open_large_ml,sealed_small_count,shot_price,small_bottle_price,large_bottle_price,active",
  "Imported Whisky,Bar,750,180,6,120,3,40,250,900,true",
].join("\n");

const PREPARED_ALCOHOL_IMPORT_TEMPLATE = [
  "name,bar_counter,price,recipe,active",
  "Whisky Sour,Bar,350,Imported Whisky:60,true",
].join("\n");

export function AlcoholItemsPanel({
  bootstrap,
  catalog,
  invalidate,
  setNotice,
}: {
  bootstrap: Bootstrap;
  catalog: AlcoholCatalog;
  invalidate: () => Promise<void>;
  setNotice: NoticeSetter;
}) {
  const [type, setType] = useState<"plain_liquor" | "prepared_product">(
    "plain_liquor",
  );
  const [name, setName] = useState("");
  const [unitId, setUnitId] = useState(
    bootstrap.productionUnits.find((unit) =>
      unit.name.toLowerCase().includes("bar"),
    )?.id ?? "",
  );
  const [largeMl, setLargeMl] = useState("750");
  const [smallMl, setSmallMl] = useState("180");
  const [sealedLarge, setSealedLarge] = useState("0");
  const [openMl, setOpenMl] = useState("0");
  const [sealedSmall, setSealedSmall] = useState("0");
  const [shotPrice, setShotPrice] = useState("");
  const [smallPrice, setSmallPrice] = useState("");
  const [largePrice, setLargePrice] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [recipe, setRecipe] = useState<
    Array<{ liquorMenuItemId: string; mlPerUnit: string }>
  >([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [plainImportResult, setPlainImportResult] = useState<CsvImportResult | null>(null);
  const [productImportResult, setProductImportResult] = useState<CsvImportResult | null>(null);
  const plainLiquors = catalog.items.filter(
    (item) => item.type === "plain_liquor" && Boolean(item.active),
  );

  const create = useMutation({
    mutationFn: () => {
      const largeBottleMl = Number(largeMl || 750);
      const smallBottleMl = Number(smallMl || 180);
      const variants =
        type === "plain_liquor"
          ? [
              {
                label: "30 ml",
                kind: "shot",
                pricePaise: rupeesToPaise(shotPrice),
                volumeMl: 30,
                inventoryAction: "large_ml",
                sortOrder: 0,
                active: rupeesToPaise(shotPrice) > 0,
              },
              {
                label: `${smallBottleMl} ml`,
                kind: "small_bottle",
                pricePaise: rupeesToPaise(smallPrice),
                volumeMl: smallBottleMl,
                inventoryAction: "small_bottle",
                sortOrder: 1,
                active: rupeesToPaise(smallPrice) > 0,
              },
              {
                label: `${largeBottleMl} ml`,
                kind: "large_bottle",
                pricePaise: rupeesToPaise(largePrice),
                volumeMl: largeBottleMl,
                inventoryAction: "large_bottle",
                sortOrder: 2,
                active: rupeesToPaise(largePrice) > 0,
              },
            ].filter((variant) => variant.active)
          : [
              {
                label: "Regular",
                kind: "default",
                pricePaise: rupeesToPaise(productPrice),
                volumeMl: null,
                inventoryAction: "none",
                sortOrder: 0,
                active: true,
              },
            ];
      return hubApi.createAlcoholItem({
        type,
        name,
        productionUnitId: unitId || null,
        largeBottleMl,
        smallBottleMl,
        sealedLargeCount: Number(sealedLarge || 0),
        openLargeMl: Number(openMl || 0),
        sealedSmallCount: Number(sealedSmall || 0),
        variants,
        recipeIngredients:
          type === "prepared_product"
            ? recipe
                .filter(
                  (row) => row.liquorMenuItemId && Number(row.mlPerUnit) > 0,
                )
                .map((row) => ({
                  liquorMenuItemId: row.liquorMenuItemId,
                  mlPerUnit: Number(row.mlPerUnit),
                }))
            : [],
      });
    },
    onSuccess: async () => {
      setName("");
      setShotPrice("");
      setSmallPrice("");
      setLargePrice("");
      setProductPrice("");
      setRecipe([]);
      await invalidate();
      setNotice({ tone: "good", text: "Alcohol item added." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const importPlainLiquor = useMutation({
    mutationFn: (csv: string) => hubApi.importAlcoholCsv("plain_liquor", csv),
    onSuccess: async (result) => {
      setPlainImportResult(result);
      await invalidate();
      setNotice({
        tone: result.failed ? "bad" : "good",
        text: result.failed ? `${result.created} liquor items imported. ${result.failed} rows need fixing.` : `${result.created} liquor items imported.`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const importPreparedProducts = useMutation({
    mutationFn: (csv: string) => hubApi.importAlcoholCsv("prepared_product", csv),
    onSuccess: async (result) => {
      setProductImportResult(result);
      await invalidate();
      setNotice({
        tone: result.failed ? "bad" : "good",
        text: result.failed ? `${result.created} alcohol products imported. ${result.failed} rows need fixing.` : `${result.created} alcohol products imported.`,
      });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });

  const canSubmit =
    name.trim() &&
    (type === "plain_liquor"
      ? [shotPrice, smallPrice, largePrice].some(
          (value) => rupeesToPaise(value) > 0,
        )
      : rupeesToPaise(productPrice) > 0);

  return (
    <div className="alcohol-layout">
      <section className="panel alcohol-form-panel">
        <div className="panel-title">
          <h2>Add Alcohol Item</h2>
          <span>
            {type === "plain_liquor" ? "Liquor stock" : "Cocktail recipe"}
          </span>
        </div>
        <form
          className="alcohol-form"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label>
            Type
            <select
              value={type}
              onChange={(event) =>
                setType(
                  event.target.value as "plain_liquor" | "prepared_product",
                )
              }
            >
              <option value="plain_liquor">Plain liquor</option>
              <option value="prepared_product">
                Prepared alcohol product
              </option>
            </select>
          </label>
          <label>
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                type === "plain_liquor" ? "Royal Stag" : "Whisky Sour"
              }
            />
          </label>
          <label>
            Bar counter
            <select
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            >
              <option value="">Alcohol group default</option>
              {bootstrap.productionUnits
                .filter((unit) => unit.active)
                .map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
            </select>
          </label>
          {type === "plain_liquor" ? (
            <>
              <div className="three-col">
                <label>
                  Large ml
                  <input
                    value={largeMl}
                    onChange={(event) => setLargeMl(event.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Small ml
                  <input
                    value={smallMl}
                    onChange={(event) => setSmallMl(event.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Open large ml
                  <input
                    value={openMl}
                    onChange={(event) => setOpenMl(event.target.value)}
                    inputMode="numeric"
                  />
                </label>
              </div>
              <div className="three-col">
                <label>
                  Large bottles
                  <input
                    value={sealedLarge}
                    onChange={(event) => setSealedLarge(event.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Small bottles
                  <input
                    value={sealedSmall}
                    onChange={(event) => setSealedSmall(event.target.value)}
                    inputMode="numeric"
                  />
                </label>
                <span />
              </div>
              <div className="three-col">
                <label>
                  30 ml price
                  <input
                    value={shotPrice}
                    onChange={(event) => setShotPrice(event.target.value)}
                    inputMode="decimal"
                    placeholder="120"
                  />
                </label>
                <label>
                  Small bottle price
                  <input
                    value={smallPrice}
                    onChange={(event) => setSmallPrice(event.target.value)}
                    inputMode="decimal"
                    placeholder="480"
                  />
                </label>
                <label>
                  Large bottle price
                  <input
                    value={largePrice}
                    onChange={(event) => setLargePrice(event.target.value)}
                    inputMode="decimal"
                    placeholder="1800"
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <label>
                Price
                <input
                  value={productPrice}
                  onChange={(event) => setProductPrice(event.target.value)}
                  inputMode="decimal"
                  placeholder="350"
                />
              </label>
              <div className="recipe-list">
                {recipe.map((row, index) => (
                  <div className="recipe-row" key={index}>
                    <select
                      value={row.liquorMenuItemId}
                      onChange={(event) =>
                        setRecipe((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  liquorMenuItemId: event.target.value,
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="">Choose liquor</option>
                      {plainLiquors.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                    <input
                      value={row.mlPerUnit}
                      onChange={(event) =>
                        setRecipe((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, mlPerUnit: event.target.value }
                              : entry,
                          ),
                        )
                      }
                      inputMode="numeric"
                      placeholder="ml"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRecipe((current) =>
                          current.filter(
                            (_, entryIndex) => entryIndex !== index,
                          ),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary-inline"
                  onClick={() =>
                    setRecipe((current) => [
                      ...current,
                      {
                        liquorMenuItemId: plainLiquors[0]?.id ?? "",
                        mlPerUnit: "30",
                      },
                    ])
                  }
                >
                  <Plus size={14} />
                  Add liquor
                </button>
              </div>
            </>
          )}
          <button type="submit" disabled={!canSubmit || create.isPending}>
            Add alcohol item
          </button>
        </form>
        <details className="setup-subdetails csv-import-details alcohol-import-details">
          <summary>
            <span>Import alcohol from CSV</span>
            <small>Stock and products</small>
          </summary>
          <div className="csv-import-grid">
            <CsvImportBox
              title="Plain liquor stock"
              templateName="plain-liquor-template.csv"
              templateCsv={PLAIN_LIQUOR_IMPORT_TEMPLATE}
              busy={importPlainLiquor.isPending}
              result={plainImportResult}
              onImport={(csv) => importPlainLiquor.mutate(csv)}
            />
            <CsvImportBox
              title="Prepared alcohol products"
              templateName="prepared-alcohol-template.csv"
              templateCsv={PREPARED_ALCOHOL_IMPORT_TEMPLATE}
              busy={importPreparedProducts.isPending}
              result={productImportResult}
              onImport={(csv) => importPreparedProducts.mutate(csv)}
            />
          </div>
        </details>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>Alcohol Catalog</h2>
          <span>{catalog.items.length} items</span>
        </div>
        <div className="alcohol-item-list">
          {catalog.items.map((item) => (
            <article
              key={item.id}
              className="stock-row alcohol-catalog-row"
            >
              <div>
                <strong>{item.name}</strong>
                <span>
                  {item.type === "plain_liquor"
                    ? `${item.large_bottle_ml} ml / ${item.small_bottle_ml} ml`
                    : item.recipeIngredients
                        .map(
                          (entry) =>
                            `${entry.ml_per_unit} ml ${entry.liquor_name}`,
                        )
                        .join(", ") || "No liquor recipe"}
                </span>
              </div>
              <div className="catalog-row-actions">
                <div className="variant-price-list">
                  {(item.variants ?? [])
                    .filter((variant) => Boolean(variant.active))
                    .map((variant) => (
                      <span key={variant.id}>
                        {variant.label} {formatInr(variant.price_paise)}
                      </span>
                    ))}
                </div>
                <button
                  type="button"
                  className="secondary-inline"
                  onClick={() =>
                    setEditingId((current) =>
                      current === item.id ? null : item.id,
                    )
                  }
                >
                  <Pencil size={14} />
                  Edit
                </button>
              </div>
              {editingId === item.id ? (
                <AlcoholEditForm
                  item={item}
                  plainLiquors={plainLiquors}
                  units={bootstrap.productionUnits.filter(
                    (unit) => unit.active,
                  )}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await invalidate();
                  }}
                  setNotice={setNotice}
                />
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
