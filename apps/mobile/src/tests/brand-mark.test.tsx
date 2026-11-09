// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BrandMark, brandDisplayName } from "../components/brand-mark";

vi.mock("react-native", () => ({
  View: ({ children }: any) => createElement("div", null, children),
  Text: ({ children }: any) => createElement("span", null, children),
  Image: ({ source, onError, resizeMode }: any) => createElement("img", { src: source.uri, onError, "data-resize-mode": resizeMode }),
  StyleSheet: { create: (value: unknown) => value },
  Platform: { OS: "android" },
  StatusBar: { currentHeight: 0 },
}));
afterEach(cleanup);
const branding = { restaurantName: "Saffron Table", logoImageDataUrl: null, updatedAt: null };

it("uses restaurant initials and name as the fallback identity", () => {
  render(<BrandMark branding={branding} />);
  expect(screen.getByText("ST")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  expect(brandDisplayName(branding)).toBe("Saffron Table");
  expect(brandDisplayName(null)).toBe("Restaurant");
});

it("shows the uploaded image uncropped and falls back to initials if it cannot load", () => {
  const logoImageDataUrl = "data:image/png;base64,AAAA";
  render(<BrandMark branding={{ ...branding, logoImageDataUrl }} />);
  const image = screen.getByRole("img");
  expect(image.getAttribute("src")).toBe(logoImageDataUrl);
  expect(image.getAttribute("data-resize-mode")).toBe("contain");
  fireEvent.error(image);
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.getByText("ST")).toBeTruthy();
});

it("previews the pending restaurant name when the logo is removed", () => {
  render(<BrandMark branding={branding} previewUri={null} previewName="Garden Cafe" />);
  expect(screen.getByText("GC")).toBeTruthy();
});


it("uses the derived app icon while keeping the full receipt artwork separate", () => {
  render(<BrandMark branding={{ ...branding, logoImageDataUrl: "data:image/png;base64,SOURCE", iconImageDataUrl: "data:image/png;base64,ICON" }} />);
  expect(screen.getByRole("img").getAttribute("src")).toBe("data:image/png;base64,ICON");
});
