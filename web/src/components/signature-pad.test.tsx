import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";

function SignaturePadWithRef({
  onRef,
}: {
  onRef: (handle: SignaturePadHandle | null) => void;
}) {
  const ref = useRef<SignaturePadHandle>(null);
  // pass the ref value up after first render
  return (
    <SignaturePad
      ref={(handle) => {
        (ref as React.MutableRefObject<SignaturePadHandle | null>).current =
          handle;
        onRef(handle);
      }}
    />
  );
}

describe("SignaturePad", () => {
  it("renders a canvas with role img", () => {
    render(<SignaturePad />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("renders the Löschen button", () => {
    render(<SignaturePad />);
    expect(
      screen.getByRole("button", { name: /löschen/i }),
    ).toBeInTheDocument();
  });

  it("uses the provided ariaLabel on the canvas", () => {
    render(<SignaturePad ariaLabel="Meine Unterschrift" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Meine Unterschrift",
    );
  });

  it("isEmpty() returns true initially via ref", () => {
    let handle: SignaturePadHandle | null = null;
    render(<SignaturePadWithRef onRef={(h) => (handle = h)} />);
    expect(handle).not.toBeNull();
    expect(handle!.isEmpty()).toBe(true);
  });

  it("clear() keeps isEmpty true when already empty", () => {
    let handle: SignaturePadHandle | null = null;
    render(<SignaturePadWithRef onRef={(h) => (handle = h)} />);
    handle!.clear();
    expect(handle!.isEmpty()).toBe(true);
  });
});
