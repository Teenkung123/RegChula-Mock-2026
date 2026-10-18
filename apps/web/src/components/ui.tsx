import { AlertTriangle, Check, ChevronDown, Info } from "lucide-react"
import {
  Alert,
  Button as HeroButton,
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
} from "@heroui/react"
import { forwardRef, useId, type ComponentProps, type ReactNode } from "react"
import styles from "./ui.module.css"

interface ButtonProps
  extends Omit<
    ComponentProps<typeof HeroButton>,
    "children" | "className" | "isDisabled" | "isPending" | "variant"
  > {
  children?: ReactNode
  className?: string
  disabled?: boolean
  variant?: "primary" | "quiet" | "outline"
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, variant = "outline", loading = false, disabled, className, ...props },
  ref,
) {
  return (
    <HeroButton
      className={`${styles.button ?? ""} ${className ?? ""}`.trim()}
      data-inline-control="button"
      data-reg-variant={variant}
      isDisabled={disabled || loading}
      isPending={loading}
      ref={ref}
      variant={variant === "quiet" ? "secondary" : variant}
      {...props}
    >
      {loading ? <Spinner className={styles.spinner ?? ""} aria-hidden="true" /> : null}
      <span className={styles.buttonContent} aria-busy={loading}>
        {children}
      </span>
    </HeroButton>
  )
})

interface FieldProps extends Omit<ComponentProps<typeof Input>, "children" | "className" | "id"> {
  label: string
  helper?: string | undefined
  error?: string | undefined
  id?: string
  className?: string
  leadingIcon?: ReactNode
}

export function Field({ label, helper, error, id, className, leadingIcon, ...props }: FieldProps) {
  const generatedId = useId()
  const fieldId = id ?? props.name ?? generatedId
  const helperId = `${fieldId}-helper`
  const input = (
    <Input
      className={styles.input ?? ""}
      id={fieldId}
      aria-label={label}
      aria-describedby={helperId}
      {...props}
    />
  )
  return (
    <TextField
      className={`${styles.field ?? ""} ${className ?? ""}`.trim()}
      isInvalid={Boolean(error)}
    >
      <Label className={styles.label ?? ""} htmlFor={fieldId}>
        {label}
      </Label>
      {leadingIcon ? (
        <div
          className={styles.fieldControl}
          data-field-control="true"
          data-invalid={Boolean(error)}
        >
          <span className={styles.fieldIcon} aria-hidden="true">
            {leadingIcon}
          </span>
          {input}
        </div>
      ) : (
        input
      )}
      {error ? (
        <FieldError className={styles.helper ?? ""} id={helperId}>
          {error}
        </FieldError>
      ) : (
        <Description className={styles.helper ?? ""} id={helperId}>
          {helper ?? " "}
        </Description>
      )}
    </TextField>
  )
}

const emptySelectKey = "__regchula_empty__"

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export function SelectField({
  label,
  value,
  options,
  onValueChange,
  id,
  disabled = false,
}: {
  label: string
  value: string
  options: SelectOption[]
  onValueChange: (value: string) => void
  id?: string
  disabled?: boolean
}) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const selectedKey = value === "" ? null : value
  const placeholder = options.find((option) => option.value === "")?.label

  return (
    <Select
      className={styles.selectField ?? ""}
      fullWidth
      id={fieldId}
      isDisabled={disabled}
      onSelectionChange={(key) =>
        onValueChange(key === null || key === emptySelectKey ? "" : String(key))
      }
      {...(placeholder === undefined ? {} : { placeholder })}
      selectedKey={selectedKey}
    >
      <Label className={styles.label ?? ""} id={`${fieldId}-label`}>
        {label}
      </Label>
      <Select.Trigger
        aria-labelledby={`${fieldId}-label`}
        className={styles.selectTrigger ?? ""}
        data-inline-control="select"
      >
        <Select.Value />
        <Select.Indicator className={styles.selectIcon ?? ""}>
          <ChevronDown aria-hidden="true" size={16} />
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover className={styles.selectPopover ?? ""}>
        <ListBox className={styles.selectList ?? ""}>
          {options.map((option) => {
            const key = option.value === "" ? emptySelectKey : option.value
            return (
              <ListBox.Item
                className={styles.selectItem ?? ""}
                id={key}
                isDisabled={option.disabled ?? false}
                key={key}
                textValue={option.label}
              >
                <span className={styles.selectItemText ?? ""}>{option.label}</span>
                <ListBox.ItemIndicator className={styles.selectIndicator ?? ""}>
                  <Check aria-hidden="true" size={16} />
                </ListBox.ItemIndicator>
              </ListBox.Item>
            )
          })}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: "neutral" | "error" | "success" | "warning"
}) {
  const Icon = tone === "error" ? AlertTriangle : tone === "success" ? Check : Info
  const status = tone === "error" ? "danger" : tone === "success" ? "success" : "accent"
  return (
    <Alert
      className={styles.status ?? ""}
      data-tone={tone}
      role={tone === "error" ? "alert" : "status"}
      status={status}
    >
      <Alert.Indicator>
        <Icon aria-hidden="true" size={16} />
      </Alert.Indicator>
      <Alert.Content>{children}</Alert.Content>
    </Alert>
  )
}
