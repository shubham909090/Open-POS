import { useMutation } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { formatInr } from "@gaurav-pos/shared";
import { Pencil, Trash2 } from "lucide-react";
import { hubApi, type AlcoholCatalog, type Bootstrap } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { AlcoholEditForm } from "./alcohol-edit-form.js";
import { AlcoholItemCreatePanel } from "./alcohol-item-create-panel.js";

export function AlcoholItemsPanel({
  bootstrap,
  catalog,
  invalidate,
  setNotice,
  requestManagerApproval
}: {
  bootstrap: Bootstrap;
  catalog: AlcoholCatalog;
  invalidate: () => Promise<void>;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const plainLiquors = catalog.items.filter(
    (item) => item.type === "plain_liquor" && Boolean(item.active),
  );

  const deleteItem = useMutation({
    mutationFn: async (item: AlcoholCatalog["items"][number]) => {
      const approval = await requestManagerApproval({
        title: `Delete ${item.name}`,
        message: "Unused alcohol items are deleted. Used stock, recipe, or history items are disabled.",
        defaultReason: "Delete alcohol item",
        confirmLabel: "Delete alcohol",
        danger: true
      });
      return hubApi.deleteAlcoholItem(item.id, { ...approval, approvedBy: "owner" });
    },
    onSuccess: async (result) => {
      await invalidate();
      setNotice({ tone: "good", text: result.deleted ? "Alcohol item deleted." : "Alcohol item disabled because it has history." });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const bulkDelete = useMutation({
    mutationFn: async () => {
      const approval = await requestManagerApproval({
        title: "Delete all alcohol items",
        message: "Unused alcohol items will be deleted. Used stock, recipe, or history items will be disabled.",
        defaultReason: "Bulk delete alcohol",
        confirmLabel: "Delete alcohol",
        danger: true
      });
      return hubApi.bulkDeleteAlcoholItems({ ...approval, approvedBy: "owner" });
    },
    onSuccess: async (result) => {
      await invalidate();
      setNotice({ tone: result.failed ? "bad" : "good", text: `${result.deleted} alcohol items deleted, ${result.disabled} disabled${result.failed ? `, ${result.failed} failed` : ""}.` });
    },
    onError: (error) => setNotice({ tone: "bad", text: messageOf(error) }),
  });
  const catalogNeedle = catalogSearch.trim().toLowerCase();
  const matchedCatalogItems = catalog.items.filter((item) => {
    if (!catalogNeedle) return true;
    return [
      item.name,
      item.type === "plain_liquor" ? "plain liquor" : "prepared product",
      item.production_unit_name,
      ...(item.variants ?? []).map((variant) => variant.label)
    ].filter(Boolean).some((part) => String(part).toLowerCase().includes(catalogNeedle));
  });
  const filteredCatalogItems = catalogNeedle ? matchedCatalogItems.slice(0, 150) : matchedCatalogItems;
  const catalogSearchCapped = Boolean(catalogNeedle && matchedCatalogItems.length > filteredCatalogItems.length);

  return (
    <div className="alcohol-layout">
      <AlcoholItemCreatePanel bootstrap={bootstrap} catalog={catalog} invalidate={invalidate} setNotice={setNotice} />

      <section className="panel">
        <div className="panel-title">
          <h2>Alcohol Catalog</h2>
          <span>{filteredCatalogItems.length} of {catalog.items.length} items</span>
        </div>
        <div className="setup-search-row">
          <input
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="Search liquor, cocktails, variants, or counter"
          />
          <button type="button" className="danger-link" disabled={catalog.items.length === 0 || bulkDelete.isPending} onClick={() => bulkDelete.mutate()}>
            Delete all alcohol
          </button>
          {catalogSearchCapped ? <small>Showing first {filteredCatalogItems.length} matches. Keep typing to narrow.</small> : null}
        </div>
        <div className="report-table-wrap alcohol-catalog-wrap">
          <table className="data-table alcohol-catalog-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Type</th>
                <th>Stock / recipe</th>
                <th>Menu prices</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
          {filteredCatalogItems.map((item) => (
            <Fragment key={item.id}>
              <tr>
                <td className="strong-cell">{item.name}</td>
                <td>{item.type === "plain_liquor" ? "Plain liquor" : "Prepared product"}</td>
                <td className="wrap-cell">
                  {item.type === "plain_liquor"
                    ? `${item.large_bottle_ml} ml / ${item.small_bottle_ml} ml`
                    : item.recipeIngredients
                        .map(
                          (entry) =>
                            `${entry.ml_per_unit} ml ${entry.liquor_name}`,
                        )
                        .join(", ") || "No liquor recipe"}
                </td>
                <td>
                  <div className="variant-price-list">
                    {(item.variants ?? [])
                      .filter((variant) => Boolean(variant.active))
                      .map((variant) => (
                        <span key={variant.id}>
                          {variant.label} {formatInr(variant.price_paise)}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="action-cell">
                  <button
                    type="button"
                    className="secondary-inline compact"
                    onClick={() =>
                      setEditingId((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                  >
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary-inline compact danger"
                    disabled={deleteItem.isPending}
                    onClick={() => deleteItem.mutate(item)}
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
              {editingId === item.id ? (
                <tr>
                  <td colSpan={5} className="report-table-detail alcohol-edit-cell">
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
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
