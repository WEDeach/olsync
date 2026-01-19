import React from "react";
import { List,ListItem,ListItemText,Typography,Box } from "@mui/material";

export interface ICompareListProps {
    source: { [key: string]: any };
    target: { [key: string]: any };
}

function getDiffRows(source: any,target: any) {
    const rows: Array<{
        key: string;
        sourceValue: any;
        targetValue: any;
        status: "added"|"removed"|"changed"|"unchanged";
    }>=[];

    const allKeys=Array.from(
        new Set([...Object.keys(source||{}),...Object.keys(target||{})])
    );

    allKeys.forEach((key) => {
        const sourceValue=source?.[key];
        const targetValue=target?.[key];
        if(sourceValue===undefined&&targetValue!==undefined) {
            rows.push({ key,sourceValue,targetValue,status: "added" });
        } else if(sourceValue!==undefined&&targetValue===undefined) {
            rows.push({ key,sourceValue,targetValue,status: "removed" });
        } else if(JSON.stringify(sourceValue)!==JSON.stringify(targetValue)) {
            rows.push({ key,sourceValue,targetValue,status: "changed" });
        } else {
            rows.push({ key,sourceValue,targetValue,status: "unchanged" });
        }
    });

    return rows;
}

const statusColor={
    added: "#d4f8db",
    removed: "#ffeef0",
    changed: "#fff5b1",
    unchanged: "inherit",
};

const statusLabel={
    added: "新增",
    removed: "刪除",
    changed: "修改",
    unchanged: "",
};

const CompareList: React.FC<ICompareListProps>=({ source,target }) => {
    const rows=getDiffRows(source,target);

    return (
        <Box>
            <Typography variant="h6" gutterBottom>
                差異比較
            </Typography>
            <List>
                {rows.map((row) => (
                    <ListItem
                        key={row.key}
                        sx={{
                            bgcolor: statusColor[row.status],
                            borderRadius: 1,
                            mb: 0.5,
                            display: "flex",
                            alignItems: "flex-start",
                        }}
                    >
                        <Box sx={{ minWidth: 120,fontWeight: "bold" }}>
                            {row.key}
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <ListItemText
                                primary={
                                    <Box sx={{ display: "flex",gap: 2 }}>
                                        <Box>
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                            >
                                                原始
                                            </Typography>
                                            <Typography
                                                variant="body1"
                                                sx={{
                                                    textDecoration:
                                                        row.status==="removed"||
                                                            row.status==="changed"
                                                            ? "line-through"
                                                            :"none",
                                                }}
                                            >
                                                {JSON.stringify(row.sourceValue)}
                                            </Typography>
                                        </Box>
                                        <Box>
                                            <Typography
                                                variant="body2"
                                                color="text.secondary"
                                            >
                                                目標
                                            </Typography>
                                            <Typography
                                                variant="body1"
                                                sx={{
                                                    fontWeight:
                                                        row.status==="added"||
                                                            row.status==="changed"
                                                            ? "bold"
                                                            :"normal",
                                                }}
                                            >
                                                {JSON.stringify(row.targetValue)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                }
                                secondary={
                                    statusLabel[row.status]&&(
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            {statusLabel[row.status]}
                                        </Typography>
                                    )
                                }
                            />
                        </Box>
                    </ListItem>
                ))}
            </List>
        </Box>
    );
};

export default CompareList;