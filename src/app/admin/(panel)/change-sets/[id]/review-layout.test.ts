import { expect, test } from "vitest";
import { sidebarWidthAfterKey } from "./review-layout";

test("the review divider responds to navigation keys and keeps both columns usable", () => {
  const narrow = sidebarWidthAfterKey(320, "Home")!;
  const wide = sidebarWidthAfterKey(320, "End")!;

  expect(sidebarWidthAfterKey(320, "ArrowLeft")).toBe(336);
  expect(sidebarWidthAfterKey(320, "ArrowRight")).toBe(304);
  expect(sidebarWidthAfterKey(narrow, "ArrowRight")).toBe(narrow);
  expect(sidebarWidthAfterKey(wide, "ArrowLeft")).toBe(wide);
  expect(sidebarWidthAfterKey(wide, "Enter")).toBe(320);
  expect(sidebarWidthAfterKey(320, "Tab")).toBeUndefined();
});
