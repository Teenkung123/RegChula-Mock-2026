import { toPng } from "html-to-image"

/** Lay out a separate export before capture so the PNG never inherits a phone-sized viewport. */
export async function exportSchedulePng(source: HTMLElement, hours: number) {
  await document.fonts.ready
  const copy = source.cloneNode(true) as HTMLElement
  const inherited = getComputedStyle(source)
  for (const name of inherited) {
    if (name.startsWith("--")) copy.style.setProperty(name, inherited.getPropertyValue(name))
  }
  for (const element of copy.querySelectorAll("[id]")) element.removeAttribute("id")
  for (const element of copy.querySelectorAll("[data-schedule-export-omit]")) element.remove()
  copy.dataset.scheduleExport = "true"
  copy.setAttribute("aria-hidden", "true")
  copy.inert = true
  Object.assign(copy.style, {
    position: "fixed",
    left: "-30000px",
    top: "0",
    width: `${112 + hours * 144 + 48}px`,
    maxWidth: "none",
    margin: "0",
    fontFamily: inherited.fontFamily,
  })
  document.body.append(copy)
  try {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
    const bounds = copy.getBoundingClientRect()
    return await toPng(copy, {
      pixelRatio: 2,
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
      backgroundColor: getComputedStyle(copy).backgroundColor,
      style: { position: "static", left: "auto", top: "auto", margin: "0" },
    })
  } finally {
    copy.remove()
  }
}
