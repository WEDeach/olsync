import { Box, Link, Typography } from "@mui/material";
import React, { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { isExternalHttpUrl, isSafeImageUrl } from "../../utils/markdownUrl";
import { remarkGithubCommitLinks } from "../../utils/remarkGithubCommitLinks";
import { remarkHardBreaks } from "../../utils/remarkHardBreaks";

const markdownComponents: Components = {
    a: ({ href, children }) => {
        if (typeof href === "string" && isExternalHttpUrl(href)) {
            const isCommitLink = /\/commit\/[0-9a-f]{7,40}$/i.test(href);
            return (
                <Link
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                        e.preventDefault();
                        window.olsCore.openExternal(href);
                    }}
                >
                    {isCommitLink ? (
                        <Box component="span" sx={{ fontFamily: "monospace" }}>
                            {children}
                        </Box>
                    ) : (
                        children
                    )}
                </Link>
            );
        }
        return <span>{children}</span>;
    },
    img: ({ src, alt }) => {
        if (typeof src === "string" && isSafeImageUrl(src)) {
            return (
                <Box
                    component="img"
                    src={src}
                    alt={alt ?? ""}
                    loading="lazy"
                    sx={{ maxWidth: "100%", height: "auto", borderRadius: 1 }}
                />
            );
        }
        if (alt) {
            return (
                <Typography component="i" variant="body2" color="text.secondary">
                    {alt}
                </Typography>
            );
        }
        return null;
    },
};

export interface ReleaseNotesProps {
    notes: string;
    maxHeight?: number | string;
}

export const ReleaseNotes: React.FC<ReleaseNotesProps> = memo(({ notes, maxHeight = 320 }) => {
    return (
        <Box
            sx={{
                maxHeight,
                overflowY: "auto",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                px: 1.5,
                py: 0.5,
                "& img": { maxWidth: "100%" },
                "& table": { display: "block", overflowX: "auto", borderCollapse: "collapse" },
                "& th, & td": { border: "1px solid", borderColor: "divider", px: 1, py: 0.5 },
                "& code": { bgcolor: "action.hover", px: 0.5, borderRadius: 0.5, fontSize: "0.9em" },
                "& pre": { overflowX: "auto" },
                "& pre code": { display: "block", p: 1 },
                "& p": { my: 0.5 },
                "& h1, & h2, & h3, & h4, & h5, & h6": { my: 1 },
            }}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkGithubCommitLinks, remarkHardBreaks]}
                rehypePlugins={[rehypeRaw, rehypeSanitize]}
                components={markdownComponents}
            >
                {notes}
            </ReactMarkdown>
        </Box>
    );
});
