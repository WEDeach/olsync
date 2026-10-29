interface MarkdownNode {
    type: string;
    value?: string;
    children?: MarkdownNode[];
}

const SKIP_PARENT_TYPES = new Set(["link", "linkReference", "code", "inlineCode", "html"]);

function splitHardBreaks(value: string, isLast: boolean): MarkdownNode[] {
    const parts = value.split(/\r?\n/);
    if (parts.length === 1) return [{ type: "text", value }];
    if (isLast && parts[parts.length - 1] === "") parts.pop();
    const nodes: MarkdownNode[] = [];
    for (let index = 0; index < parts.length; index++) {
        if (parts[index].length > 0) nodes.push({ type: "text", value: parts[index] });
        if (index < parts.length - 1) nodes.push({ type: "break" });
    }
    return nodes.length > 0 ? nodes : [{ type: "break" }];
}

function walk(node: MarkdownNode, parentType?: string): void {
    if (!node.children) return;
    const nextChildren: MarkdownNode[] = [];
    for (let index = 0; index < node.children.length; index++) {
        const child = node.children[index];
        if (child.type === "text" && typeof child.value === "string" && !SKIP_PARENT_TYPES.has(parentType ?? "")) {
            nextChildren.push(...splitHardBreaks(child.value, index === node.children.length - 1));
            continue;
        }
        walk(child, child.type);
        nextChildren.push(child);
    }
    node.children = nextChildren;
}

export function remarkHardBreaks() {
    return (tree: MarkdownNode) => {
        walk(tree);
    };
}
