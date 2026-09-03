import { Info } from "@mui/icons-material";
import { Link, Tooltip } from "@mui/material";
import React from "react";

export interface InfoLinkTooltipProps {
    title: React.ReactNode;
    linkText?: string;
    href?: string;
    postfix?: React.ReactNode;
}

export const InfoLinkTooltip: React.FC<InfoLinkTooltipProps> = ({ title, linkText, href, postfix }) => {
    return (
        <Tooltip
            title={
                <React.Fragment>
                    {title}
                    {linkText && href && (
                        <Link href={href} target="_blank" rel="noreferrer">
                            {linkText}
                        </Link>
                    )}
                    {postfix}
                </React.Fragment>
            }
            arrow
        >
            <Info fontSize="small" color="action" />
        </Tooltip>
    );
};
