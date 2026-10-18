import { Time } from "@internationalized/date"
import { Description, FieldError, Label, Modal, TimeField } from "@heroui/react"
import type { ActivityDto, ActivityInputDto } from "@regchula/api/public-types"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Clock3, Plus } from "lucide-react"
import { useRef, useState } from "react"
import { useI18n } from "../i18n"
import { deleteActivity, getActivities, getMe, saveActivity } from "../lib/api"
import { Button, Field, SelectField, Status } from "./ui"
import styles from "./PersonalPlanning.module.css"

export const activityTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
const toMinute = (time: Time | null) => (time ? time.hour * 60 + time.minute : Number.NaN)
const toTime = (minute: number) => new Time(Math.floor((minute % 1440) / 60), minute % 60)

function ActivityTimeField({
  label,
  value,
  onChange,
  disabled,
  invalid,
  description,
}: {
  label: string
  value: Time | null
  onChange: (value: Time | null) => void
  disabled: boolean
  invalid: boolean
  description?: string
}) {
  const { text } = useI18n()
  return (
    <TimeField
      value={value}
      onChange={onChange}
      isRequired
      isDisabled={disabled}
      isInvalid={invalid}
      hourCycle={24}
      granularity="minute"
      shouldForceLeadingZeros
      className={styles.activityTimeField ?? ""}
    >
      <Label>{label}</Label>
      <TimeField.Group variant="secondary" className={styles.activityTimeGroup ?? ""}>
        <TimeField.Prefix>
          <Clock3 size={17} aria-hidden="true" />
        </TimeField.Prefix>
        <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
      </TimeField.Group>
      {description ? <Description>{description}</Description> : null}
      <FieldError>
        {text({
          th: "ตรวจสอบเวลาเริ่มและเวลาสิ้นสุด",
          en: "Check the start and end times.",
          zh: "请检查开始和结束时间。",
        })}
      </FieldError>
    </TimeField>
  )
}

export function useActivities(termId: number | undefined) {
  const me = useQuery({ queryKey: ["me"], queryFn: getMe })
  const owner = me.data?.studentId
  return useQuery({
    queryKey: ["activities", owner, termId],
    queryFn: () => getActivities(termId as number),
    enabled: Boolean(owner && termId),
  })
}

export function ScheduleActivities({
  termId,
  activities,
  dayLabel,
}: {
  termId: number
  activities: ReturnType<typeof useActivities>
  dayLabel: (day: ActivityInputDto["dayCode"]) => string
}) {
  const { text } = useI18n()
  const client = useQueryClient()
  const [editor, setEditor] = useState<{ activity?: ActivityDto } | null>(null)
  const [deleting, setDeleting] = useState<ActivityDto | null>(null)
  const [title, setTitle] = useState("")
  const [dayCode, setDayCode] = useState<ActivityInputDto["dayCode"]>("MO")
  const [start, setStart] = useState<Time | null>(new Time(12))
  const [end, setEnd] = useState<Time | null>(new Time(13))
  const startMinute = toMinute(start)
  const endMinute = end ? toMinute(end) || 1440 : Number.NaN
  const [validation, setValidation] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const addButton = useRef<HTMLButtonElement | null>(null)
  const restoreFocus = () =>
    window.requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : addButton.current)?.focus({
        preventScroll: true,
      }),
    )
  const close = () => {
    setEditor(null)
    setDeleting(null)
    restoreFocus()
  }
  const mutation = useMutation({
    mutationFn: async (action: "save" | "delete") => {
      if (action === "delete" && deleting) return deleteActivity(termId, deleting.id)
      return saveActivity(
        termId,
        { title: title.trim(), dayCode, startMinute, endMinute },
        editor?.activity?.id,
      )
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["activities"] })
      close()
    },
  })
  const open = (element: HTMLButtonElement, activity?: ActivityDto) => {
    trigger.current = element
    setTitle(activity?.title ?? "")
    setDayCode(activity?.dayCode ?? "MO")
    setStart(toTime(activity?.startMinute ?? 720))
    setEnd(toTime(activity?.endMinute ?? 780))
    setValidation(false)
    mutation.reset()
    setEditor(activity ? { activity } : {})
  }
  const heading = text({ th: "กิจกรรมส่วนตัว", en: "Personal activities", zh: "个人活动" })
  return (
    <section className={styles.panel} aria-label={heading}>
      <div className={styles.row}>
        <div>
          <h2>{heading}</h2>
          <p>
            {text({
              th: "ทำซ้ำทุกสัปดาห์ เฉพาะภาคนี้ • ภาคใหม่เริ่มด้วยรายการว่าง",
              en: "Repeats weekly in this term • Each new term starts empty",
              zh: "本学期每周重复 • 新学期从空白开始",
            })}
          </p>
        </div>
        <Button ref={addButton} onClick={(event) => open(event.currentTarget as HTMLButtonElement)}>
          <Plus size={16} aria-hidden="true" />
          {text({ th: "เพิ่มกิจกรรม", en: "Add activity", zh: "添加活动" })}
        </Button>
      </div>
      {activities.isError ? (
        <Status tone="error">
          {text({ th: "โหลดกิจกรรมไม่ได้", en: "Could not load activities", zh: "无法加载活动" })}
          <Button onClick={() => void activities.refetch()}>
            {text({ th: "ลองอีกครั้ง", en: "Retry", zh: "重试" })}
          </Button>
        </Status>
      ) : null}
      {activities.isPending ? (
        <p role="status">
          {text({ th: "กำลังโหลดกิจกรรม", en: "Loading activities", zh: "正在加载活动" })}
        </p>
      ) : null}
      {activities.data?.length === 0 ? (
        <p>
          {text({
            th: "เพิ่มมื้อกลางวัน กีฬา หรือเวลาพักลงในตาราง",
            en: "Add lunch, sports, or a break to your timetable.",
            zh: "将午餐、运动或休息添加到课程表。",
          })}
        </p>
      ) : null}
      {activities.data?.map((activity) => (
        <div className={styles.row} key={activity.id}>
          <div>
            <strong>{activity.title}</strong>
            <span>
              {dayLabel(activity.dayCode)} · {activityTime(activity.startMinute)}–
              {activityTime(activity.endMinute)}
            </span>
          </div>
          <div className={styles.actions}>
            <Button
              aria-label={`${text({ th: "แก้ไข", en: "Edit", zh: "编辑" })} ${activity.title}`}
              onClick={(event) => open(event.currentTarget as HTMLButtonElement, activity)}
            >
              {text({ th: "แก้ไข", en: "Edit", zh: "编辑" })}
            </Button>
            <Button
              aria-label={`${text({ th: "ลบ", en: "Delete", zh: "删除" })} ${activity.title}`}
              onClick={(event) => {
                trigger.current = event.currentTarget as HTMLButtonElement
                mutation.reset()
                setDeleting(activity)
              }}
            >
              {text({ th: "ลบ", en: "Delete", zh: "删除" })}
            </Button>
          </div>
        </div>
      ))}
      <Modal.Backdrop
        isOpen={Boolean(editor || deleting)}
        isDismissable={!mutation.isPending}
        onOpenChange={(isOpen) => {
          if (!isOpen && !mutation.isPending) close()
        }}
      >
        <Modal.Container placement="center" scroll="inside">
          <Modal.Dialog
            className={styles.dialog ?? ""}
            aria-label={
              deleting ? text({ th: "ลบกิจกรรม", en: "Delete activity", zh: "删除活动" }) : heading
            }
          >
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault()
                if (mutation.isPending) return
                if (deleting) {
                  mutation.mutate("delete")
                  return
                }
                const valid =
                  title.trim().length > 0 &&
                  Number.isFinite(startMinute) &&
                  Number.isFinite(endMinute) &&
                  startMinute < endMinute &&
                  endMinute <= 1440
                setValidation(!valid)
                if (valid) mutation.mutate("save")
              }}
            >
              <h2>
                {deleting
                  ? text({
                      th: `ลบ “${deleting.title}”?`,
                      en: `Delete “${deleting.title}”?`,
                      zh: `删除“${deleting.title}”？`,
                    })
                  : heading}
              </h2>
              {!deleting ? (
                <>
                  <Field
                    label={text({ th: "ชื่อกิจกรรม", en: "Activity name", zh: "活动名称" })}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={100}
                    required
                    disabled={mutation.isPending}
                  />
                  <SelectField
                    label={text({ th: "วัน", en: "Day", zh: "星期" })}
                    value={dayCode}
                    onValueChange={(value) => setDayCode(value as ActivityInputDto["dayCode"])}
                    options={(["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const).map((day) => ({
                      value: day,
                      label: dayLabel(day),
                    }))}
                    disabled={mutation.isPending}
                  />
                  <div className={styles.times}>
                    <ActivityTimeField
                      label={text({ th: "เวลาเริ่ม", en: "Start time", zh: "开始时间" })}
                      value={start}
                      onChange={setStart}
                      disabled={mutation.isPending}
                      invalid={validation && (!start || startMinute >= endMinute)}
                    />
                    <ActivityTimeField
                      label={text({ th: "เวลาสิ้นสุด", en: "End time", zh: "结束时间" })}
                      value={end}
                      onChange={setEnd}
                      disabled={mutation.isPending}
                      invalid={validation && (!end || startMinute >= endMinute)}
                      description={text({
                        th: "00:00 = เที่ยงคืนเมื่อสิ้นสุดวันนี้",
                        en: "00:00 = midnight at the end of this day",
                        zh: "00:00 = 当天结束时的午夜",
                      })}
                    />
                  </div>
                  <p>
                    {text({
                      th: "กิจกรรมข้ามคืนให้แยกเป็นสองวัน เวลาซ้อนแสดงคำเตือน",
                      en: "Split overnight activities into two days. Overlaps show a warning.",
                      zh: "跨夜活动请分成两天，重叠时会显示警告。",
                    })}
                  </p>
                </>
              ) : null}
              {validation ? (
                <Status tone="error">
                  {text({
                    th: "ระบุชื่อและเวลาสิ้นสุดหลังเวลาเริ่ม",
                    en: "Enter a name and an end time after the start.",
                    zh: "请输入名称，结束时间须晚于开始时间。",
                  })}
                </Status>
              ) : null}
              {mutation.isError ? <Status tone="error">{mutation.error.message}</Status> : null}
              <div className={styles.actions}>
                <Button type="button" disabled={mutation.isPending} onClick={close}>
                  {text({ th: "ยกเลิก", en: "Cancel", zh: "取消" })}
                </Button>
                <Button type="submit" loading={mutation.isPending} variant="primary">
                  {deleting
                    ? text({ th: "ลบกิจกรรม", en: "Delete activity", zh: "删除活动" })
                    : text({ th: "บันทึกกิจกรรม", en: "Save activity", zh: "保存活动" })}
                </Button>
              </div>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </section>
  )
}
