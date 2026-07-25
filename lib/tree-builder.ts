/**
 * Converts a flat list of file paths into a hierarchical tree structure.
 * Useful for rendering repository file explorers.
 */

export interface TreeNode {
  name: string;
  path: string; // Full path
  type: "file" | "directory";
  children?: TreeNode[];
}

export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "root", path: "", type: "directory", children: [] };

  for (const path of paths) {
    const parts = path.split("/");
    let currentNode = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = currentNode.path ? `${currentNode.path}/${part}` : part;

      let child = currentNode.children?.find((c) => c.name === part);

      if (!child) {
        child = {
          name: part,
          path: currentPath,
          type: isFile ? "file" : "directory",
        };
        if (!isFile) {
          child.children = [];
        }
        currentNode.children = currentNode.children || [];
        currentNode.children.push(child);
      }

      currentNode = child;
    }
  }

  // Sort: Directories first, then alphabetical
  function sortTree(node: TreeNode) {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === "directory" ? -1 : 1;
      });
      node.children.forEach(sortTree);
    }
  }

  sortTree(root);
  return root.children || [];
}
