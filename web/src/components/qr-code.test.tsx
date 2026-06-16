import { render, screen } from "@testing-library/react";
import { QrCode } from "./qr-code";

describe("QrCode", () => {
  it("renders an element with role img", () => {
    render(<QrCode value="hello" ariaLabel="Test-QR" />);
    const el = screen.getByRole("img", { name: "Test-QR" });
    expect(el).toBeInTheDocument();
  });

  it("renders an svg element", () => {
    const { container } = render(<QrCode value="hello" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
