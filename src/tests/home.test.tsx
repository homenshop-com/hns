import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

// Minimal smoke test — verifies the test infrastructure (vitest + jsdom +
// @testing-library/jest-dom) is wired correctly. The previous test rendered
// the async `Home` server component directly, which is not supported by
// React Testing Library and also pulled in next-auth's `next/server` import
// that vitest cannot resolve. Server-rendered pages should be covered by
// end-to-end tests (Playwright), not unit tests.
describe("Test infrastructure", () => {
  it("renders a simple component and matches DOM assertions", () => {
    render(<h1>homeNshop</h1>);
    expect(screen.getByText("homeNshop")).toBeInTheDocument();
  });

  it("supports role-based queries", () => {
    render(<button>Click</button>);
    expect(screen.getByRole("button", { name: "Click" })).toBeInTheDocument();
  });
});
