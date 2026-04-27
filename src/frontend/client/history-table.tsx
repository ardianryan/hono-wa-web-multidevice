/* @jsxImportSource react */
import React, { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

type ActionLogRow = {
  id: string;
  sessionId: string;
  createdAt: string;
  success: boolean;
  payload: any;
  error?: string | null;
};

const UNSEND_WINDOW_MS = 48 * 60 * 60 * 1000;
const collectMessageIds = (payload: any): string[] => {
  const direct = Array.isArray(payload?.sentMessageIds) ? payload.sentMessageIds : [];
  const nested = Array.isArray(payload?.sentItems)
    ? payload.sentItems.flatMap((item: any) =>
        Array.isArray(item?.messageIds) ? item.messageIds : []
      )
    : [];
  return Array.from(new Set([...direct, ...nested].map((v) => String(v ?? "").trim()).filter(Boolean)));
};
const canUnsend = (row: ActionLogRow) =>
  collectMessageIds(row.payload).length > 0 &&
  Date.now() - new Date(row.createdAt).getTime() <= UNSEND_WINDOW_MS;

export const HistoryTable = ({
  data,
  actionType,
  selectedSessionId,
}: {
  data: ActionLogRow[];
  actionType: "message" | "broadcast";
  selectedSessionId: string;
}) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo<ColumnDef<ActionLogRow, any>[]>(() => {
    const baseCols: ColumnDef<ActionLogRow, any>[] = [
      {
        id: "select",
        header: () => "Pilih",
        cell: ({ row }) => (
          <input
            type="checkbox"
            name="selectedIds"
            value={row.original.id}
            form={`history-${actionType}-bulk-form`}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "createdAt",
        header: "Waktu",
        cell: ({ getValue }) => new Date(getValue() as string).toLocaleString(),
      },
      {
        accessorKey: "sessionId",
        header: "Session",
      },
    ];

    if (actionType === "message") {
      baseCols.push({
        id: "target",
        header: "Target",
        accessorFn: (row) => row.payload?.phone ?? row.payload?.groupId ?? "-",
        cell: ({ getValue }) => <span className="muted">{String(getValue())}</span>,
      });
    } else {
      baseCols.push({
        id: "total",
        header: "Total",
        accessorFn: (row) => String((row.payload?.phones ?? []).length),
        cell: ({ getValue }) => <span className="muted">{String(getValue())}</span>,
      });
      baseCols.push({
        id: "delay",
        header: "Delay",
        accessorFn: (row) =>
          row.payload?.delayMs ? String(Math.floor(Number(row.payload.delayMs) / 1000)) : "-",
        cell: ({ getValue }) => <span className="muted">{String(getValue())}</span>,
      });
    }

    baseCols.push({
      id: "message",
      header: "Ringkas",
      accessorFn: (row) => String(row.payload?.message ?? "-"),
      cell: ({ getValue }) => (
        <div style={{ maxWidth: "360px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {String(getValue())}
        </div>
      ),
    });

    baseCols.push({
      id: "status",
      header: "Status",
      accessorFn: (row) =>
        row.payload?.status
          ? String(row.payload.status) + (row.error ? `: ${row.error}` : "")
          : row.success
          ? "sent"
          : `failed${row.error ? `: ${row.error}` : ""}`,
      cell: ({ getValue }) => <span className="muted">{String(getValue())}</span>,
    });

    baseCols.push({
      id: "actions",
      header: "Aksi",
      enableSorting: false,
      cell: ({ row }) => {
        const h = row.original;
        return (
          <div className="btnRow">
            <form method="post" action="/admin/history/resend">
              <input type="hidden" name="actionType" value={actionType} />
              <input type="hidden" name="sessionId" value={selectedSessionId} />
              <input type="hidden" name="actionLogId" value={h.id} />
              <button className="btn success" type="submit">Resend</button>
            </form>
            <form method="post" action="/admin/history/unsend">
              <input type="hidden" name="actionType" value={actionType} />
              <input type="hidden" name="sessionId" value={selectedSessionId} />
              <input type="hidden" name="actionLogId" value={h.id} />
              <button className="btn warning" type="submit" disabled={!canUnsend(h)}>Unsend</button>
            </form>
            <form method="post" action="/admin/history/delete">
              <input type="hidden" name="actionType" value={actionType} />
              <input type="hidden" name="sessionId" value={selectedSessionId} />
              <input type="hidden" name="actionLogId" value={h.id} />
              <button className="btn danger" type="submit">Delete</button>
            </form>
          </div>
        );
      },
    });

    return baseCols;
  }, [actionType, selectedSessionId]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div>
      <div style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <input
          value={globalFilter ?? ""}
          onChange={(e) => setGlobalFilter((e.target as HTMLInputElement).value)}
          className="input"
          placeholder="Search all columns..."
          style={{ maxWidth: "300px" }}
        />
        <div className="muted" style={{ fontSize: "13px" }}>
          Showing {table.getRowModel().rows.length} of {data.length} entries
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%" }}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ cursor: header.column.getCanSort() ? "pointer" : "default" }}
                  >
                    {header.isPlaceholder ? null : (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: ' 🔼',
                          desc: ' 🔽',
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="muted">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: "center", padding: "20px" }}>
                  No data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {table.getPageCount() > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px", alignItems: "center" }}>
          <button
            className="btn"
            onClick={(e) => { e.preventDefault(); table.setPageIndex(0); }}
            disabled={!table.getCanPreviousPage()}
          >
            {"<<"}
          </button>
          <button
            className="btn"
            onClick={(e) => { e.preventDefault(); table.previousPage(); }}
            disabled={!table.getCanPreviousPage()}
          >
            {"<"}
          </button>
          <span className="muted" style={{ fontSize: "14px", margin: "0 8px" }}>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <button
            className="btn"
            onClick={(e) => { e.preventDefault(); table.nextPage(); }}
            disabled={!table.getCanNextPage()}
          >
            {">"}
          </button>
          <button
            className="btn"
            onClick={(e) => { e.preventDefault(); table.setPageIndex(table.getPageCount() - 1); }}
            disabled={!table.getCanNextPage()}
          >
            {">>"}
          </button>
          <select
            className="select"
            style={{ width: "auto", marginLeft: "10px", padding: "8px" }}
            value={table.getState().pagination.pageSize}
            onChange={(e) => {
              table.setPageSize(Number((e.target as HTMLSelectElement).value));
            }}
          >
            {[10, 20, 30, 40, 50].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                Show {pageSize}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};


