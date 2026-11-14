import {
  Button as HeroButton,
  Input as HeroInput,
  Label as HeroLabel,
  ListBox as HeroListBox,
  Select as HeroSelect,
  Spinner,
  TextArea as HeroTextArea,
  TextField as HeroTextField,
} from "@heroui/react"
import { forwardRef, type ComponentProps } from "react"
import styles from "../../web/src/components/ui.module.css"
import pageStyles from "../../web/src/pages/pages.module.css"

export { AlertDialog, Drawer, Modal } from "@heroui/react"
export { pageStyles }

const classes = (...values: Array<string | undefined | false>) => values.filter(Boolean).join(" ")

export const Button = forwardRef<HTMLButtonElement, ComponentProps<typeof HeroButton>>(
  function Button(
    { children, className, variant = "secondary", isPending = false, isDisabled, ...props },
    ref,
  ) {
    return (
      <HeroButton
        {...props}
        ref={ref}
        className={classes(
          styles.button,
          typeof className === "string" ? className : undefined,
          props.isIconOnly && "staff-icon-button",
        )}
        data-inline-control="button"
        data-reg-variant={
          variant === "primary" ? "primary" : variant === "ghost" ? "quiet" : "outline"
        }
        variant={variant === "secondary" ? "outline" : variant === "ghost" ? "secondary" : variant}
        isDisabled={isDisabled || isPending}
        isPending={isPending}
      >
        {(renderProps) => (
          <>
            {isPending && <Spinner className={styles.spinner ?? ""} aria-hidden="true" />}
            <span className={styles.buttonContent} aria-busy={isPending}>
              {typeof children === "function" ? children(renderProps) : children}
            </span>
          </>
        )}
      </HeroButton>
    )
  },
)

export const Input = forwardRef<HTMLInputElement, ComponentProps<typeof HeroInput>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <HeroInput
      {...props}
      ref={ref}
      className={classes(styles.input, typeof className === "string" ? className : undefined)}
    />
  )
})

export function Label({ className, ...props }: ComponentProps<typeof HeroLabel>) {
  return <HeroLabel {...props} className={classes(styles.label, className)} />
}

export function TextField({ className, ...props }: ComponentProps<typeof HeroTextField>) {
  return (
    <HeroTextField
      {...props}
      className={classes(styles.field, typeof className === "string" ? className : undefined)}
    />
  )
}

export const TextArea = forwardRef<HTMLTextAreaElement, ComponentProps<typeof HeroTextArea>>(
  function TextArea({ className, ...props }, ref) {
    return (
      <HeroTextArea
        {...props}
        ref={ref}
        className={classes(
          styles.input,
          "staff-textarea",
          typeof className === "string" ? className : undefined,
        )}
      />
    )
  },
)

function SelectRoot({ className, ...props }: ComponentProps<typeof HeroSelect>) {
  return (
    <HeroSelect
      {...props}
      className={classes(styles.selectField, typeof className === "string" ? className : undefined)}
    />
  )
}
function SelectTrigger({ className, ...props }: ComponentProps<typeof HeroSelect.Trigger>) {
  return (
    <HeroSelect.Trigger
      {...props}
      className={classes(
        styles.selectTrigger,
        typeof className === "string" ? className : undefined,
      )}
      data-inline-control="select"
    />
  )
}
function SelectPopover({ className, ...props }: ComponentProps<typeof HeroSelect.Popover>) {
  return (
    <HeroSelect.Popover
      {...props}
      className={classes(
        styles.selectPopover,
        "staff-select-popover",
        typeof className === "string" ? className : undefined,
      )}
    />
  )
}

export const Select = Object.assign(SelectRoot, {
  Trigger: SelectTrigger,
  Value: HeroSelect.Value,
  Indicator: HeroSelect.Indicator,
  Popover: SelectPopover,
})

function ListBoxRoot({ className, ...props }: ComponentProps<typeof HeroListBox>) {
  return (
    <HeroListBox
      {...props}
      className={classes(styles.selectList, typeof className === "string" ? className : undefined)}
    />
  )
}
function ListBoxItem({ className, ...props }: ComponentProps<typeof HeroListBox.Item>) {
  return (
    <HeroListBox.Item
      {...props}
      className={classes(styles.selectItem, typeof className === "string" ? className : undefined)}
    />
  )
}
export const ListBox = Object.assign(ListBoxRoot, {
  Item: ListBoxItem,
  ItemIndicator: HeroListBox.ItemIndicator,
})
