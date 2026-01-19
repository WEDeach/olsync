import { TableContainer,TableHead,TableRow,TableCell,Table as MTable,Paper,TableBody,Checkbox,Avatar,FormControlLabel } from "@mui/material";
import { observer } from "mobx-react";
import React,{ useMemo,useState } from "react";
import { Dimensions } from "react-virtualized";
import { DefaultObject,PropertyTypeName } from "realm/dist/public-types/schema/types";
import { AudioPlayer } from "./audioPlayer";

interface Props {
    dimensions: Dimensions;
    heads: IPropertyWithName[]
    rows: DefaultObject[]
    onScrollToBottom?: () => void;
    threshold?: number;
    rowHeight?: number
}

export interface CheckBoxWithCallback {
    checked: boolean;
    callback: (v: boolean) => void;
}

export interface IPropertyWithName {
    name: string|null;
    type: PropertyTypeName|"checkbox"|"picture"|"audio";
    key?: string;
    displayName?: string;
    link?: string;
    shell_link?: string;
    checkbox_toggler?: CheckBoxWithCallback;
    append_keys?: string[];
}

export const Table=observer(({
    dimensions,
    heads,
    rows,
    onScrollToBottom,
    threshold=10,
    rowHeight=100
}: Props) => {
    const { height,width }=dimensions;

    const onScroll=(event: React.UIEvent<HTMLDivElement>) => {
        const target=event.currentTarget;
        setScrollTop(target.scrollTop);

        if(onScrollToBottom) {
            const { scrollTop,scrollHeight,clientHeight }=target;
            const distanceFromBottom=scrollHeight-scrollTop-clientHeight;
            if(distanceFromBottom<threshold) {
                onScrollToBottom();
            }
        }
    };

    const [scrollTop,setScrollTop]=useState(0);

    const visibleRange=useMemo(() => {
        const headerHeight=56;
        const availableHeight=height-headerHeight;

        const startIndex=Math.floor(scrollTop/rowHeight);
        const visibleCount=Math.ceil(availableHeight/rowHeight)+2;
        const endIndex=Math.min(startIndex+visibleCount,rows.length);

        return { startIndex,endIndex,visibleCount };
    },[scrollTop,height,rowHeight,rows.length]);

    const visibleRows=rows.slice(visibleRange.startIndex,visibleRange.endIndex);

    return (
        <TableContainer
            sx={{ height: height,width: width }}
            component={Paper}
            onScroll={onScroll}
        >
            <MTable stickyHeader>
                <TableHead>
                    <TableRow>
                        {heads.map((property) => (
                            <TableCell key={property.name}>
                                {property.checkbox_toggler&&(

                                    <FormControlLabel
                                        value="end"
                                        control={<Checkbox />}
                                        label={property.name}
                                        checked={property.checkbox_toggler!.checked}
                                        onChange={() => property.checkbox_toggler!.callback(!property.checkbox_toggler!.checked)}
                                    />
                                )}
                                {property.name}
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>

                    {visibleRange.startIndex>0&&(
                        <TableRow style={{ height: visibleRange.startIndex*rowHeight }}>
                            <TableCell
                                colSpan={heads.length}
                                sx={{ border: 0,padding: 0 }}
                            />
                        </TableRow>
                    )}

                    {visibleRows.map((row,index) => {
                        const actualIndex=visibleRange.startIndex+index;
                        return (
                            <TableRow
                                key={actualIndex}
                                hover
                                sx={{
                                    height: rowHeight,
                                    '&:last-child td, &:last-child th': { border: 0 }
                                }}
                            >
                                {heads.map((property) => (
                                    <TableCell key={property.name}>
                                        {renderCellContent(row,property)}
                                    </TableCell>
                                ))}
                            </TableRow>
                        );
                    })}
                    {visibleRange.endIndex<rows.length&&(
                        <TableRow
                            style={{
                                height: (rows.length-visibleRange.endIndex)*rowHeight
                            }}
                        >
                            <TableCell
                                colSpan={heads.length}
                                sx={{ border: 0,padding: 0 }}
                            />
                        </TableRow>
                    )}
                </TableBody>
            </MTable>
        </TableContainer>
    );
});

const renderCellContent=(row: any,property: IPropertyWithName) => {
    let r: any=`{t:${property.type}}`;
    const key=property.key??property.name??"";
    const append_key=property.append_keys?.map(k => row[k]).join(' ')??null;
    const render_key=(r: any) => append_key? `${r} ${append_key}`:r;

    if(property.type==="uuid") {
        r=Array.from(row[key].buffer)
            .map((b: any) => b.toString(16).padStart(2,'0'))
            .join('');
    } else if(property.type==="list") {
        const listData=row[key];
        if(listData&&listData.length!==undefined) {
            r=`[${listData.length} items] ${Array.from(listData)
                .slice(0,3)
                .map(item => typeof item==='object'? JSON.stringify(item):String(item))
                .join(', ')}${listData.length>3? '...':''}`;
        } else {
            r='[]';
        }
    } else if([
        "string","bool","int","float","double","decimal128",
        "objectId","data","date","mixed"
    ].includes(property.type)) {
        r=row[key];
        if(r instanceof Date) {
            r=r.toLocaleString();
        }
    } else if(property.type==="checkbox") {
        const isChecked=row[key]?.value===true;
        return (
            <FormControlLabel
                value="end"
                control={<Checkbox />}
                label={append_key}
                checked={isChecked}
                onChange={(_,checked) => row[key]?.callback?.(checked)}
            />
        );
    } else if(property.type==="picture") {
        const url=row[key];
        return (
            <Avatar alt="" src={url} variant="square" />
        );
    } else if(property.type==="audio") {
        const url=row[key];
        return (
            <AudioPlayer url={url} />
        );
    }

    if(property.link) {
        const link=row[`#${property.link}`];
        const shell_link=(property.shell_link&&row[`#${property.shell_link}`])||link;
        const handleClick=(e: React.MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();

            if(e.ctrlKey||e.metaKey) {
                window.olsCore.openExternal(shell_link);
            } else {
                window.open(link,'_blank','noopener,noreferrer');
            }
        };

        return <a
            onClick={handleClick}
            style={{ cursor: 'pointer',color: '#1976d2',textDecoration: 'underline' }}
        >
            {render_key(r)}
        </a>;
    }

    return render_key(r);
};
