import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "./sheet";

describe("booking sheet dismissal", () => {
  it("keeps one usable close button outside the scrolling booking body", () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange}>
        <SheetContent scrollBody className="h-[100dvh]">
          <SheetTitle>Booking details</SheetTitle>
          <SheetDescription>Stay information</SheetDescription>
          <p>Booking body</p>
        </SheetContent>
      </Sheet>,
    );
    const close = screen.getByRole("button", { name: "Close" });
    const body = screen.getByText("Booking body").parentElement;
    expect(body).toHaveClass("overflow-y-auto", "min-h-0");
    expect(body?.contains(close)).toBe(false);
    expect(close).toHaveClass("h-11", "w-11");
    expect(close.parentElement?.className).toContain("safe-area-inset-top");
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});