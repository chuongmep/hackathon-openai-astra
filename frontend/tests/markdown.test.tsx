import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "bun:test";
import { MarkdownMessage } from "../src/components/MarkdownMessage";

test("assistant Markdown renders headings, bold and GFM tables", () => {
  const html = renderToStaticMarkup(
    <MarkdownMessage>
      {
        "### Materials\n\n**Steel**\n\n| Code | Description |\n| --- | --- |\n| A1010 | Foundations |"
      }
    </MarkdownMessage>,
  );
  expect(html).toContain("<h3>Materials</h3>");
  expect(html).toContain("<strong>Steel</strong>");
  expect(html).toContain("<table>");
  expect(html).toContain("Response table");
});
test("assistant Markdown does not execute HTML or unsafe links", () => {
  const html = renderToStaticMarkup(
    <MarkdownMessage>
      {
        "<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n![tracking](https://example.com/pixel)"
      }
    </MarkdownMessage>,
  );
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("<img");
});
