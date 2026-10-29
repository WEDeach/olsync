import { GITHUB_OWNER, GITHUB_REPO } from "../updater-core/constants";

const COMMIT_HASH = /\b([0-9a-fA-F]{7,40})\b/g;
const SKIP_PARENT_TYPES = new Set(["link", "linkReference", "code", "inlineCode", "html"]);

interface MarkdownNode {
    type: string;
    value?: string;
    url?: string;
    children?: MarkdownNode[];
}

function commitLink(hash: string): MarkdownNode {
    return {
        type: "link",
        url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${hash}`,
        children: [{ type: "text", value: hash }],
    };
}

export function splitCommitHashes(value: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(COMMIT_HASH)) {
        const index = match.index ?? 0;
        if (index > lastIndex) {
            nodes.push({ type: "text", value: value.slice(lastIndex, index) });
        }
        nodes.push(commitLink(match[1]));
        lastIndex = index + match[0].length;
    }
    if (lastIndex < value.length) {
        nodes.push({ type: "text", value: value.slice(lastIndex) });
    }
    return nodes.length > 0 ? nodes : [{ type: "text", value }];
}

function walk(node: MarkdownNode, parentType?: string): void {
    if (!node.children) return;
    const nextChildren: MarkdownNode[] = [];
    for (const child of node.children) {
        if (child.type === "text" && typeof child.value === "string" && !SKIP_PARENT_TYPES.has(parentType ?? "")) {
            nextChildren.push(...splitCommitHashes(child.value));
            continue;
        }
        walk(child, child.type);
        nextChildren.push(child);
    }
    node.children = nextChildren;
}

export function remarkGithubCommitLinks() {
    return (tree: MarkdownNode) => {
        walk(tree);
    };
}
