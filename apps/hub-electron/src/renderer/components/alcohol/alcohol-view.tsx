import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Wine, Beer } from "lucide-react";
import { hubApi, type Bootstrap } from "../../hub-api.js";
import { type NoticeSetter, messageOf } from "../../lib/format.js";
import type { ManagerApprovalRequest } from "../../hooks/use-manager-approval.js";
import { Notice } from "../ui/notice.js";
import { Segmented } from "../ui/segmented.js";
import { AlcoholItemsPanel } from "./alcohol-items-panel.js";
import { AlcoholStoragePanel } from "./alcohol-storage-panel.js";

export function AlcoholView({
  bootstrap,
  setNotice,
  requestManagerApproval,
}: {
  bootstrap: Bootstrap;
  setNotice: NoticeSetter;
  requestManagerApproval: ManagerApprovalRequest;
}) {
  const queryClient = useQueryClient();
  const alcohol = useQuery({ queryKey: ["alcohol"], queryFn: hubApi.alcohol });
  const [tab, setTab] = useState<"items" | "storage">("items");
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["alcohol"] });
    await queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  return (
    <div className="alcohol-board">
      <Segmented
        value={tab}
        onChange={setTab}
        className="alcohol-tabs"
        options={[
          { value: "items", label: "Items" },
          { value: "storage", label: "Storage" },
        ]}
      />
      {alcohol.isLoading ? (
        <div className="text-sm text-muted p-4">Loading alcohol stock...</div>
      ) : null}
      {alcohol.error ? (
        <Notice variant="error">{messageOf(alcohol.error)}</Notice>
      ) : null}
      {alcohol.data && tab === "items" ? (
        <AlcoholItemsPanel
          bootstrap={bootstrap}
	          catalog={alcohol.data}
	          invalidate={invalidate}
	          setNotice={setNotice}
	          requestManagerApproval={requestManagerApproval}
	        />
      ) : null}
      {alcohol.data && tab === "storage" ? (
        <AlcoholStoragePanel
          rows={alcohol.data.storage}
          invalidate={invalidate}
          setNotice={setNotice}
          requestManagerApproval={requestManagerApproval}
        />
      ) : null}
    </div>
  );
}
