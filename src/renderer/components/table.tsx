import {
    Avatar,
    Box,
    Checkbox,
    FormControlLabel,
    Table as MTable,
    Paper,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
} from "@mui/material";
import { observer } from "mobx-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions } from "react-virtualized";
import { DefaultObject, PropertyTypeName } from "realm/dist/public-types/schema/types";
import { formatDateTime, formatTimeAgo } from "../../utils/time";
import { AudioPlayer } from "./audioPlayer";

interface Props {
    dimensions: Dimensions;
    heads: IPropertyWithName[];
    rows: DefaultObject[];
    onScrollToBottom?: () => void;
    threshold?: number;
    rowHeight?: number;
    onRowClick?: (row: any, index: number) => void;
    size?: "small" | "medium";
    onRowHover?: (key: string | null) => void;
    highlightKey?: string | null;
    onVisibleKeysChange?: (keys: string[]) => void;
    getRowKey?: (row: DefaultObject, index: number) => any;
}

export interface CheckBoxWithCallback {
    checked: boolean;
    callback: (v: boolean) => void;
}

export interface IPropertyWithName {
    name: string | null;
    type: PropertyTypeName | "checkbox" | "picture" | "audio";
    key?: string;
    displayName?: string;
    link?: string;
    shell_link?: string;
    checkbox_toggler?: CheckBoxWithCallback;
    append_keys?: string[];
    render?: (row: any) => React.ReactNode | null;
    width?: string | number;
    align?: "left" | "right" | "center";
}

export const Table = observer(
    ({
        dimensions,
        heads,
        rows,
        onScrollToBottom,
        threshold = 10,
        rowHeight = 100,
        onRowClick,
        size = "small",
        onRowHover,
        highlightKey,
        onVisibleKeysChange,
        getRowKey,
    }: Props) => {
        const { height, width } = dimensions;

        const onScroll = (event: React.UIEvent<HTMLDivElement>) => {
            const target = event.currentTarget;
            setScrollTop(target.scrollTop);

            if (onScrollToBottom) {
                const { scrollTop, scrollHeight, clientHeight } = target;
                const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
                if (distanceFromBottom < threshold) {
                    onScrollToBottom();
                }
            }
        };

        const [scrollTop, setScrollTop] = useState(0);
        const [sortState, setSortState] = useState<{ key: string; order: "asc" | "desc" } | null>(null);
        const headRef = useRef<HTMLTableSectionElement>(null);
        const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(size === "small" ? 40 : 56);

        useEffect(() => {
            const el = headRef.current;
            if (!el) return;
            const update = () => {
                const h = el.getBoundingClientRect().height;
                if (h > 0) setMeasuredHeaderHeight(h);
            };
            update();
            const obs = new ResizeObserver(update);
            obs.observe(el);
            return () => obs.disconnect();
        }, []);

        const handleColumnSort = (key: string) => {
            setSortState((prev) => {
                if (prev?.key !== key) return { key, order: "asc" };
                if (prev.order === "asc") return { key, order: "desc" };
                return null;
            });
        };

        const sortedRows = useMemo(() => {
            if (!sortState) return rows;
            return [...rows].sort((a, b) => {
                const aRaw = a[sortState.key] as any;
                const bRaw = b[sortState.key] as any;
                const aVal = aRaw && typeof aRaw === "object" && "value" in aRaw ? aRaw.value : aRaw;
                const bVal = bRaw && typeof bRaw === "object" && "value" in bRaw ? bRaw.value : bRaw;
                let comp: number;
                if (typeof aVal === "boolean" && typeof bVal === "boolean") {
                    comp = (bVal ? 1 : 0) - (aVal ? 1 : 0);
                } else {
                    const aStr = aVal == null ? "" : String(aVal);
                    const bStr = bVal == null ? "" : String(bVal);
                    comp = aStr.localeCompare(bStr);
                }
                return sortState.order === "asc" ? comp : -comp;
            });
        }, [rows, sortState]);

        const visibleRange = useMemo(() => {
            const availableHeight = height - measuredHeaderHeight;

            const startIndex = Math.floor(scrollTop / rowHeight);
            const visibleCount = Math.ceil(availableHeight / rowHeight) + 2;
            const endIndex = Math.min(startIndex + visibleCount, sortedRows.length);

            return { startIndex, endIndex, visibleCount };
        }, [scrollTop, height, rowHeight, sortedRows.length, measuredHeaderHeight]);

        const visibleRows = sortedRows.slice(visibleRange.startIndex, visibleRange.endIndex);

        useEffect(() => {
            if (!onVisibleKeysChange || !getRowKey) return;
            const keys = visibleRows.map((row, index) => getRowKey(row, visibleRange.startIndex + index));
            onVisibleKeysChange(keys);
        }, [visibleRows, visibleRange.startIndex, onVisibleKeysChange, getRowKey]);

        return (
            <TableContainer
                sx={{ height: height, width: width }}
                component={Paper}
                variant="outlined"
                onScroll={onScroll}
            >
                <MTable size={size} stickyHeader>
                    <TableHead ref={headRef}>
                        <TableRow>
                            {heads.map((property) => {
                                const colKey = property.key ?? (typeof property.name === "string" ? property.name : "");
                                const isSortable = colKey !== "";
                                const isActivelySorted = isSortable && sortState?.key === colKey;
                                const sortButton = isSortable && (
                                    <button
                                        type="button"
                                        style={{
                                            cursor: "pointer",
                                            userSelect: "none",
                                            background: "none",
                                            border: "none",
                                            padding: 0,
                                            font: "inherit",
                                            color: "inherit",
                                        }}
                                        onClick={() => handleColumnSort(colKey)}
                                    >
                                        {property.name}
                                        {isActivelySorted ? (
                                            <span style={{ marginLeft: 4 }}>
                                                {sortState?.order === "asc" ? "↑" : "↓"}
                                            </span>
                                        ) : (
                                            <span className="sort-icon" style={{ marginLeft: 4 }}>
                                                ⇅
                                            </span>
                                        )}
                                    </button>
                                );
                                return (
                                    <TableCell
                                        key={property.name}
                                        sx={{
                                            backgroundColor: "background.paper",
                                            fontWeight: 500,
                                            width: property.width,
                                            textAlign: property.align,
                                            whiteSpace: "nowrap",
                                            ...(isSortable && {
                                                "& .sort-icon": { visibility: "hidden" },
                                                "&:hover .sort-icon": { visibility: "visible" },
                                            }),
                                        }}
                                    >
                                        {property.checkbox_toggler ? (
                                            <Box sx={{ display: "flex", alignItems: "center" }}>
                                                <FormControlLabel
                                                    value="end"
                                                    control={<Checkbox />}
                                                    label={property.name}
                                                    checked={property.checkbox_toggler?.checked}
                                                    onChange={() =>
                                                        property.checkbox_toggler?.callback(
                                                            !property.checkbox_toggler?.checked,
                                                        )
                                                    }
                                                />
                                                {sortButton}
                                            </Box>
                                        ) : (
                                            sortButton
                                        )}
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {visibleRange.startIndex > 0 && (
                            <TableRow style={{ height: visibleRange.startIndex * rowHeight }}>
                                <TableCell colSpan={heads.length} sx={{ border: 0, padding: 0 }} />
                            </TableRow>
                        )}

                        {visibleRows.map((row, index) => {
                            const actualIndex = visibleRange.startIndex + index;
                            const rowKey = getRowKey ? getRowKey(row, actualIndex) : actualIndex;
                            const isHighlighted = highlightKey !== undefined && rowKey === highlightKey;
                            return (
                                <TableRow
                                    key={rowKey}
                                    hover
                                    onClick={onRowClick ? () => onRowClick(row, actualIndex) : undefined}
                                    onMouseEnter={() => onRowHover?.(rowKey as string)}
                                    onMouseLeave={() => onRowHover?.(null)}
                                    sx={{
                                        height: rowHeight,
                                        "&:last-child td, &:last-child th": { border: 0 },
                                        ...(onRowClick && { cursor: "pointer" }),
                                        ...(isHighlighted && {
                                            outline: "2px solid",
                                            outlineColor: "primary.light",
                                            outlineOffset: "-2px",
                                            bgcolor: "rgba(25, 118, 210, 0.15)",
                                        }),
                                    }}
                                >
                                    {heads.map((property) => (
                                        <TableCell
                                            key={property.name}
                                            sx={{
                                                width: property.width,
                                                textAlign: property.align,
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {renderCellContent(row, property)}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            );
                        })}
                        {visibleRange.endIndex < sortedRows.length && (
                            <TableRow
                                style={{
                                    height: (sortedRows.length - visibleRange.endIndex) * rowHeight,
                                }}
                            >
                                <TableCell colSpan={heads.length} sx={{ border: 0, padding: 0 }} />
                            </TableRow>
                        )}
                    </TableBody>
                </MTable>
            </TableContainer>
        );
    },
);

const renderCellContent = (row: any, property: IPropertyWithName) => {
    if (property.render) {
        return property.render(row);
    }

    let r: any = `{t:${property.type}}`;
    const key = property.key ?? property.name ?? "";
    const append_key = property.append_keys?.map((k) => row[k]).join(" ") ?? null;
    const render_key = (r: any) => (append_key ? `${r} ${append_key}` : r);

    if (property.type === "uuid") {
        r = Array.from(row[key].buffer)
            .map((b: any) => b.toString(16).padStart(2, "0"))
            .join("");
    } else if (property.type === "list") {
        const listData = row[key];
        if (listData && listData.length !== undefined) {
            r = `[${listData.length} items] ${Array.from(listData)
                .slice(0, 3)
                .map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item)))
                .join(", ")}${listData.length > 3 ? "..." : ""}`;
        } else {
            r = "[]";
        }
    } else if (
        ["string", "bool", "int", "float", "double", "decimal128", "objectId", "data", "date", "mixed"].includes(
            property.type,
        )
    ) {
        r = row[key];
        if (r instanceof Date) {
            return (
                <Tooltip title={formatDateTime(r.getTime())} arrow>
                    <span>{formatTimeAgo(r.getTime())}</span>
                </Tooltip>
            );
        }
    } else if (property.type === "checkbox") {
        const isChecked = row[key]?.value === true;
        return (
            <FormControlLabel
                value="end"
                control={<Checkbox />}
                label={append_key}
                checked={isChecked}
                onChange={(_, checked) => row[key]?.callback?.(checked)}
            />
        );
    } else if (property.type === "picture") {
        const url = row[key];
        return <Avatar alt="" src={url} variant="square" />;
    } else if (property.type === "audio") {
        const url = row[key];
        return <AudioPlayer url={url} />;
    }

    if (property.link) {
        const link = row[`#${property.link}`];
        const shell_link = (property.shell_link && row[`#${property.shell_link}`]) || link;
        const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();

            if (e.ctrlKey || e.metaKey) {
                window.olsCore.openExternal(shell_link);
            } else {
                window.open(link, "_blank", "noopener,noreferrer");
            }
        };

        return (
            <button
                type="button"
                onClick={handleClick}
                style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "#1976d2",
                    textDecoration: "underline",
                    font: "inherit",
                }}
            >
                {render_key(r)}
            </button>
        );
    }

    return render_key(r);
};
