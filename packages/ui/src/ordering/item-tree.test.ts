import { describe, expect, it } from "vitest";
import { itemTree } from "./item-tree";

type Node = { id: string; parentId: string | null };

const node = (id: string, parentId: string | null = null): Node => ({ id, parentId });
const byId = (item: Node) => item.id;
const parentOf = (item: Node) => item.parentId;
const ids = (items: readonly Node[]) => items.map(byId);

describe("itemTree", () => {
  it("has the items with no parent as roots and gives each item its own children", () => {
    const items = [node("a"), node("a1", "a"), node("b"), node("a2", "a"), node("a1x", "a1")];

    const tree = itemTree(items, byId, parentOf);

    expect(ids(tree.roots)).toEqual(["a", "b"]);
    expect(ids(tree.childrenOf(node("a")))).toEqual(["a1", "a2"]);
    expect(ids(tree.childrenOf(node("a1")))).toEqual(["a1x"]);
    expect(tree.childrenOf(node("b"))).toEqual([]);
  });

  it("makes a root of an item whose parent is not in the list", () => {
    const tree = itemTree([node("root"), node("orphan", "gone")], byId, parentOf);

    expect(ids(tree.roots)).toEqual(["root", "orphan"]);
  });

  it("shows every item of a cycle exactly once, under the first of them in the list", () => {
    const items = [node("root"), node("loop-a", "loop-b"), node("loop-b", "loop-a")];

    const tree = itemTree(items, byId, parentOf);

    expect(ids(tree.roots)).toEqual(["root", "loop-a"]);
    expect(ids(tree.childrenOf(node("loop-a")))).toEqual(["loop-b"]);
    expect(tree.childrenOf(node("loop-b"))).toEqual([]);
  });

  it("makes a root of an item that is its own parent", () => {
    const tree = itemTree([node("self", "self")], byId, parentOf);

    expect(ids(tree.roots)).toEqual(["self"]);
    expect(tree.childrenOf(node("self"))).toEqual([]);
  });

  it("keeps the children of two items that share a name apart, since it follows ids", () => {
    const items = [node("a"), node("b"), node("a1", "a"), node("b1", "b")];

    const tree = itemTree(items, byId, parentOf);

    expect(ids(tree.childrenOf(node("a")))).toEqual(["a1"]);
    expect(ids(tree.childrenOf(node("b")))).toEqual(["b1"]);
  });
});
