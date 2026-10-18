import { render, screen } from "@testing-library/react"
import { Check } from "lucide-react"
import { describe, expect, it } from "vitest"
import { Button, Field, SelectField } from "./ui"

describe("shared UI primitives", () => {
  it("keeps a loading button disabled with readable feedback", () => {
    render(<Button loading>บันทึก</Button>)
    expect(screen.getByRole("button")).toBeDisabled()
    expect(screen.getByText("บันทึก")).toBeVisible()
    expect(screen.getByText("บันทึก")).toHaveAttribute("aria-busy", "true")
  })

  it("marks icon-and-label buttons as a shared inline control", () => {
    render(
      <Button>
        <Check aria-hidden="true" size={16} />
        บันทึก
      </Button>,
    )
    const button = screen.getByRole("button")
    expect(button).toHaveAttribute("data-inline-control", "button")
    expect(button.querySelector("svg")).not.toBeNull()
    expect(button).toHaveTextContent("บันทึก")
  })

  it("associates field errors with the input", () => {
    render(<Field id="student" label="รหัสนิสิต" error="กรอกรหัสนิสิต" />)
    const input = screen.getByLabelText("รหัสนิสิต")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("กรอกรหัสนิสิต")
  })

  it("exposes the HeroUI select as a labelled button", () => {
    render(
      <SelectField
        label="คณะ"
        onValueChange={() => undefined}
        options={[
          { value: "", label: "ทุกคณะ" },
          { value: "วิศวกรรมศาสตร์", label: "วิศวกรรมศาสตร์" },
        ]}
        value=""
      />,
    )
    const trigger = screen.getByRole("button", { name: "คณะ" })
    expect(trigger).toHaveAttribute("data-inline-control", "select")
    expect(trigger).toHaveTextContent("ทุกคณะ")
  })
})
