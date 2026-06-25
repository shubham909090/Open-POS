import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultTallySaleLedgerName } from "@gaurav-pos/shared";
import { FileArchive, FileCode2, Save } from "lucide-react";

import { hubApi, type DownloadedFile, type RangeReportDetail, type TallyExportSettings } from "../../hub-api.js";

type RangeExportKind = "csv" | "tally";
type TallyTextField = keyof Omit<TallyExportSettings, "saleLedgerNames">;

type RangeReportExportsProps = {
  report: RangeReportDetail;
  rangeFrom: string;
  rangeTo: string;
  rangeRequest: { from: string; to: string };
  rangeIsFetching: boolean;
};

export function RangeReportExports({ report, rangeFrom, rangeTo, rangeRequest, rangeIsFetching }: RangeReportExportsProps) {
  const queryClient = useQueryClient();
  const [exportBusy, setExportBusy] = useState<RangeExportKind | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [tallySettingsDraft, setTallySettingsDraft] = useState<TallyExportSettings | null>(null);
  const [tallySettingsTouched, setTallySettingsTouched] = useState(false);
  const [tallySettingsSaving, setTallySettingsSaving] = useState(false);
  const tallyExportSettings = useQuery({
    queryKey: ["tallyExportSettings"],
    queryFn: hubApi.tallyExportSettings,
  });

  useEffect(() => {
    if (tallySettingsTouched || !tallyExportSettings.data) return;
    setTallySettingsDraft(mergeTallySettingsWithGroups(tallyExportSettings.data, report.groupSummaries));
  }, [report.groupSummaries, tallyExportSettings.data, tallySettingsTouched]);

  const rangeHasPendingChanges = rangeFrom !== rangeRequest.from || rangeTo !== rangeRequest.to;
  const exportBlockedReason = getRangeExportBlockedReason(report, rangeHasPendingChanges, rangeIsFetching);
  const tallyBlockedReason = tallySettingsTouched ? "Save Tally settings before Tally export." : exportBlockedReason;
  const csvExportDisabled = Boolean(exportBlockedReason) || Boolean(exportBusy);
  const tallyExportDisabled = Boolean(tallyBlockedReason) || Boolean(exportBusy);
  const saleGroups = uniqueSaleGroups(report.groupSummaries);

  const downloadRangeExport = async (kind: RangeExportKind) => {
    if ((kind === "csv" && csvExportDisabled) || (kind === "tally" && tallyExportDisabled)) return;
    setExportBusy(kind);
    setExportError(null);
    try {
      const file = kind === "csv"
        ? await hubApi.rangeReportCsv(rangeRequest.from, rangeRequest.to)
        : await hubApi.rangeReportTally(rangeRequest.from, rangeRequest.to);
      triggerDownload(file);
    } catch (error) {
      setExportError(messageFromError(error));
    } finally {
      setExportBusy(null);
    }
  };

  const updateTallySettingsDraft = (settings: TallyExportSettings) => {
    setTallySettingsDraft(settings);
    setTallySettingsTouched(true);
  };

  const updateTallyField = (field: TallyTextField, value: string) => {
    if (!tallySettingsDraft) return;
    updateTallySettingsDraft({ ...tallySettingsDraft, [field]: value });
  };

  const updateSaleLedger = (saleGroupId: string, value: string) => {
    if (!tallySettingsDraft) return;
    updateTallySettingsDraft({
      ...tallySettingsDraft,
      saleLedgerNames: { ...tallySettingsDraft.saleLedgerNames, [saleGroupId]: value },
    });
  };

  const saveTallySettings = async () => {
    if (!tallySettingsDraft) return;
    setTallySettingsSaving(true);
    setExportError(null);
    try {
      const saved = await hubApi.updateTallyExportSettings(tallySettingsDraft);
      setTallySettingsDraft(mergeTallySettingsWithGroups(saved, report.groupSummaries));
      setTallySettingsTouched(false);
      await queryClient.invalidateQueries({ queryKey: ["tallyExportSettings"] });
    } catch (error) {
      setExportError(messageFromError(error));
    } finally {
      setTallySettingsSaving(false);
    }
  };

  return (
    <>
      <div className="range-export-bar">
        <div className="range-export-copy">
          <strong>Full report exports</strong>
          <span>Download the selected finalized range as detailed CSV files or TallyPrime-ready XML.</span>
          {exportBlockedReason ? <em>{exportBlockedReason}</em> : null}
          {!exportBlockedReason && tallyBlockedReason ? <em>{tallyBlockedReason}</em> : null}
          {exportError ? <p className="warning-text">{exportError}</p> : null}
        </div>
        <div className="range-export-actions" aria-label="Report export actions">
          <button type="button" className="secondary-button" onClick={() => void downloadRangeExport("csv")} disabled={csvExportDisabled}>
            <FileArchive size={16} />
            {exportBusy === "csv" ? "Preparing CSV..." : "Download CSV"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void downloadRangeExport("tally")} disabled={tallyExportDisabled}>
            <FileCode2 size={16} />
            {exportBusy === "tally" ? "Preparing Tally..." : "Download Tally"}
          </button>
        </div>
      </div>
      <details className="tally-settings-details">
        <summary>
          <span>Tally ledger settings</span>
          <small>Used by XML export</small>
        </summary>
        {tallyExportSettings.isLoading && !tallySettingsDraft ? (
          <p className="plain-state tally-settings-status">Loading ledger settings...</p>
        ) : tallySettingsDraft ? (
          <form
            className="tally-settings-body"
            onSubmit={(event) => {
              event.preventDefault();
              void saveTallySettings();
            }}
          >
            <div className="tally-settings-grid">
              <label>
                Voucher type
                <input value={tallySettingsDraft.voucherTypeName} onChange={(event) => updateTallyField("voucherTypeName", event.target.value)} />
              </label>
              <label>
                Cash ledger
                <input value={tallySettingsDraft.cashLedgerName} onChange={(event) => updateTallyField("cashLedgerName", event.target.value)} />
              </label>
              <label>
                UPI ledger
                <input value={tallySettingsDraft.upiLedgerName} onChange={(event) => updateTallyField("upiLedgerName", event.target.value)} />
              </label>
              <label>
                Card ledger
                <input value={tallySettingsDraft.cardLedgerName} onChange={(event) => updateTallyField("cardLedgerName", event.target.value)} />
              </label>
              <label>
                Online ledger
                <input value={tallySettingsDraft.onlineLedgerName} onChange={(event) => updateTallyField("onlineLedgerName", event.target.value)} />
              </label>
              <label>
                Discount ledger
                <input value={tallySettingsDraft.discountLedgerName} onChange={(event) => updateTallyField("discountLedgerName", event.target.value)} />
              </label>
              <label>
                Tip ledger
                <input value={tallySettingsDraft.tipLedgerName} onChange={(event) => updateTallyField("tipLedgerName", event.target.value)} />
              </label>
              {saleGroups.map((group) => (
                <label key={group.saleGroupId}>
                  {group.name} sale ledger
                  <input
                    value={tallySettingsDraft.saleLedgerNames[group.saleGroupId] ?? defaultTallySaleLedgerName(group.name)}
                    onChange={(event) => updateSaleLedger(group.saleGroupId, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <div className="tally-settings-actions">
              <span>{saleGroups.length ? `${saleGroups.length} sale group${saleGroups.length === 1 ? "" : "s"} mapped` : "Sale ledgers use export defaults"}</span>
              <button type="submit" className="secondary-button" disabled={tallySettingsSaving}>
                <Save size={16} />
                {tallySettingsSaving ? "Saving..." : "Save Tally settings"}
              </button>
            </div>
          </form>
        ) : (
          <p className="warning-text tally-settings-status">Ledger settings could not load.</p>
        )}
      </details>
    </>
  );
}

function getRangeExportBlockedReason(report: RangeReportDetail | undefined, hasPendingChanges: boolean, isFetching: boolean) {
  if (hasPendingChanges) return "Apply the selected dates before export.";
  if (isFetching) return "Report is refreshing.";
  if (!report) return "Load a finalized range before export.";
  if (report.missingDates.length || report.unfinalizedDates.length) return "Exports unlock after every date in this range has a finalized report.";
  return null;
}

function mergeTallySettingsWithGroups(settings: TallyExportSettings, groups: RangeReportDetail["groupSummaries"]) {
  const saleLedgerNames = { ...settings.saleLedgerNames };
  for (const group of groups) {
    if (!saleLedgerNames[group.saleGroupId]) saleLedgerNames[group.saleGroupId] = defaultTallySaleLedgerName(group.name);
  }
  return { ...settings, saleLedgerNames };
}

function uniqueSaleGroups(groups: RangeReportDetail["groupSummaries"]) {
  const seen = new Set<string>();
  return groups.filter((group) => {
    if (seen.has(group.saleGroupId)) return false;
    seen.add(group.saleGroupId);
    return true;
  });
}

function triggerDownload(file: DownloadedFile) {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Report export failed.";
}
