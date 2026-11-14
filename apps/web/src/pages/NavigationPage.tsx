import { useQuery } from "@tanstack/react-query"
import {
  ArrowDown,
  ChevronDown,
  Clock3,
  Footprints,
  Info,
  MapPin,
  Route,
  TriangleAlert,
} from "lucide-react"
import { lazy, Suspense, useMemo, useState } from "react"
import { PageLoading } from "../components/PageLoading"
import { PlanViewTabs } from "../components/PlanViewTabs"
import { Button, SelectField, Status } from "../components/ui"
import { useI18n } from "../i18n"
import { getSchedule } from "../lib/api"
import {
  type CampusBuilding,
  type CampusData,
  type ClassStop,
  campusDays,
  classTransitions,
  formatClassTime,
  makeCampusGraph,
  resolveBuilding,
  roomFloor,
  walkingRoute,
} from "../lib/campus-navigation"
import styles from "./Navigation.module.css"
import pageStyles from "./pages.module.css"

const CampusMap = lazy(() =>
  import("../components/CampusMap").then((module) => ({ default: module.CampusMap })),
)
const campusBuildingIndexVersion = "building-crosswalk-v1"
async function getCampusData(): Promise<CampusData> {
  const response = await fetch("/campus/navigation-data.json", { cache: "no-cache" })
  if (!response.ok) throw new Error("Campus map data could not be loaded")
  return response.json() as Promise<CampusData>
}
const emptyPoints: Array<{ x: number; y: number }> = []

export function NavigationPage() {
  const { language, text } = useI18n()
  const tr = (en: string, th: string, zh: string) => text({ en, th, zh })
  const schedule = useQuery({ queryKey: ["schedule"], queryFn: getSchedule })
  const campus = useQuery({
    queryKey: ["campus-navigation", campusBuildingIndexVersion],
    queryFn: getCampusData,
    staleTime: Infinity,
  })
  const [selectedId, setSelectedId] = useState("")
  const [day, setDay] = useState("all")
  const [showDetails, setShowDetails] = useState(false)
  const transitions = useMemo(
    () => classTransitions(schedule.data?.registrations ?? []),
    [schedule.data],
  )
  const visible = useMemo(
    () => transitions.filter((item) => day === "all" || item.from.day === day),
    [transitions, day],
  )
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0]
  const graph = useMemo(() => (campus.data ? makeCampusGraph(campus.data) : null), [campus.data])
  const buildingLabels = useMemo(
    () =>
      (campus.data?.buildings ?? []).map((building) => ({
        id: building.footprintId ?? `code:${building.code}`,
        code: building.code,
        label: language === "th" ? building.nameTh || building.name : building.name,
        x: building.x,
        y: building.y,
      })),
    [campus.data, language],
  )
  const from = selected?.from
  const to = selected?.to
  const origin =
    from && campus.data ? resolveBuilding(campus.data.buildings, from.building, from.room) : null
  const destination =
    to && campus.data ? resolveBuilding(campus.data.buildings, to.building, to.room) : null
  const route = useMemo(
    () =>
      graph && origin && destination
        ? walkingRoute(graph, origin.accessNodeId, destination.accessNodeId)
        : null,
    [graph, origin, destination],
  )
  const endpoints = useMemo(() => {
    if (!graph || !origin || !destination) return []
    return [origin, destination].flatMap((building) => {
      const point = graph.nodes.get(building.accessNodeId)
      return point ? [{ ...point, label: building.code }] : []
    })
  }, [graph, origin, destination])
  const dayName = (code: string) =>
    ({
      MO: tr("Monday", "จันทร์", "周一"),
      TU: tr("Tuesday", "อังคาร", "周二"),
      WE: tr("Wednesday", "พุธ", "周三"),
      TH: tr("Thursday", "พฤหัสบดี", "周四"),
      FR: tr("Friday", "ศุกร์", "周五"),
      SA: tr("Saturday", "เสาร์", "周六"),
      SU: tr("Sunday", "อาทิตย์", "周日"),
    })[code] ?? code
  const hasUnspecifiedLocation = (stop: ClassStop) =>
    (stop.building.trim() || stop.room.trim()).toUpperCase() === "AR"
  const stopLabel = (stop: ClassStop) =>
    hasUnspecifiedLocation(stop)
      ? tr("Location not specified", "ยังไม่ระบุสถานที่", "地点未定")
      : [stop.building, stop.room].filter(Boolean).join(" ") ||
        tr("Room not assigned", "ยังไม่ระบุห้อง", "教室未定")
  const name = (building: CampusBuilding) =>
    language === "th" ? building.nameTh || building.name : building.name
  const stopCard = (stop: ClassStop, building: CampusBuilding | null, label: string) => {
    const floor = building ? roomFloor(building, stop.room) : null
    return (
      <div className={styles.stop}>
        <span
          className={`${styles.stopLetter} ${label === "A" ? styles.origin : styles.destination}`}
        >
          {label}
        </span>
        <div>
          <div className={styles.stopHeading}>
            <span className={styles.stopCaption}>
              {label === "A" ? tr("From", "จาก", "出发") : tr("To", "ไปยัง", "到达")}
            </span>
            <time>
              {label === "A" && selected
                ? `~${formatClassTime(selected.departureMinute)}`
                : formatClassTime(stop.start)}
            </time>
          </div>
          <strong>{stopLabel(stop)}</strong>
          {!hasUnspecifiedLocation(stop) && (
            <span>
              {building
                ? name(building)
                : tr("Building not yet mapped", "ยังไม่มีตำแหน่งอาคารนี้", "该建筑尚未映射")}
            </span>
          )}
          <small>
            {stop.courseCode} · {stop.name}
          </small>
          {label === "A" && (
            <small>
              {tr("Scheduled end", "เลิกตามตาราง", "计划下课")} {formatClassTime(stop.end)}
            </small>
          )}
          {floor && (
            <small>
              {tr("Floor", "ชั้น", "楼层")} {floor.floor}
              {floor.inferred
                ? tr(" · estimated from room code", " · ประเมินจากรหัสห้อง", " · 按教室编号估计")
                : ""}
            </small>
          )}
        </div>
      </div>
    )
  }
  const insufficient = selected && route && selected.walkingMinutes < route.minutes

  return (
    <div className={pageStyles.page} data-testid="campus-navigation">
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <p className={pageStyles.context}>
            {tr("Student services", "บริการสำหรับนิสิต", "学生服务")}
          </p>
          <h1>{tr("Campus routes", "เส้นทางระหว่างอาคาร", "校园路线")}</h1>
          <p>
            {tr(
              "Find the building for your next class and plan your walk.",
              "ค้นหาอาคารเรียนถัดไป และวางแผนการเดินระหว่างคาบเรียน",
              "查找下一节课所在建筑，规划步行路线。",
            )}
          </p>
        </div>
      </header>
      <PlanViewTabs active="navigation" />
      <div className={styles.layout}>
        <section
          className={styles.planner}
          aria-label={tr("Route planner", "วางแผนเส้นทาง", "路线规划")}
        >
          <div className={styles.sectionTitle}>
            <Route size={20} aria-hidden="true" />
            <h2>{tr("Your route", "เส้นทางของคุณ", "您的路线")}</h2>
          </div>
          {schedule.isPending ? (
            <PageLoading />
          ) : schedule.isError ? (
            <>
              <Status tone="error">
                {tr("Your schedule could not be loaded.", "โหลดตารางเรียนไม่ได้", "无法加载课程表。")}
              </Status>
              <Button onClick={() => void schedule.refetch()}>
                {tr("Retry schedule", "ลองโหลดตารางอีกครั้ง", "重试课程表")}
              </Button>
            </>
          ) : (
            <>
              <SelectField
                label={tr("Day", "วัน", "日期")}
                value={day}
                onValueChange={(value) => {
                  setDay(value)
                  setSelectedId("")
                }}
                options={[
                  { value: "all", label: tr("All days", "ทุกวัน", "所有日期") },
                  ...campusDays.map((code) => ({ value: code, label: dayName(code) })),
                ]}
              />
              {visible.length > 0 ? (
                <SelectField
                  label={tr("Between classes", "ระหว่างคาบเรียน", "课间")}
                  value={selected?.id ?? ""}
                  onValueChange={(value) => {
                    setSelectedId(value)
                  }}
                  options={visible.map((item) => ({
                    value: item.id,
                    label: `${dayName(item.from.day)} · ${formatClassTime(item.from.end)} · ${item.from.courseCode} → ${item.to.courseCode}`,
                  }))}
                />
              ) : (
                <p className={styles.empty}>
                  {day === "all"
                    ? tr(
                        "No consecutive classes in your timetable.",
                        "ยังไม่มีคาบเรียนต่อเนื่องในตารางเรียน",
                        "课程表中没有连续课程。",
                      )
                    : tr(
                        "No consecutive classes on this day. Select another day.",
                        "ไม่มีคาบเรียนต่อเนื่องในวันนี้ ลองเลือกวันอื่น",
                        "当天没有连续课程，请选择其他日期。",
                      )}
                </p>
              )}
            </>
          )}
          {from && to && (
            <div className={styles.stops}>
              {stopCard(from, origin, "A")}
              <ArrowDown className={styles.connector} size={18} aria-hidden="true" />
              {stopCard(to, destination, "B")}
            </div>
          )}
          {selected && (
            <div className={styles.walkingWindow}>
              <p className={insufficient ? styles.warning : styles.gap}>
                <Clock3 size={17} aria-hidden="true" />
                {selected.walkingMinutes > 0
                  ? tr(
                      `About ${selected.walkingMinutes} min for walking`,
                      `มีเวลาเดินประมาณ ${selected.walkingMinutes} นาที`,
                      `约有 ${selected.walkingMinutes} 分钟步行时间`,
                    )
                  : tr(
                      "No walking time between these classes",
                      "ไม่มีเวลาเดินระหว่างคาบนี้",
                      "这些课程之间没有步行时间",
                    )}
                {insufficient && (
                  <span>
                    {tr(
                      "Allow more time to reach the next class.",
                      "เวลาอาจไม่พอสำหรับการเดินไปคาบถัดไป",
                      "步行时间可能不足。",
                    )}
                  </span>
                )}
              </p>
              <p className={styles.allowance}>
                {tr(
                  `Assumes class ends ${selected.from.end - selected.departureMinute} min early.`,
                  `เผื่อเลิกเรียนก่อนเวลา ${selected.from.end - selected.departureMinute} นาที`,
                  `按提前 ${selected.from.end - selected.departureMinute} 分钟下课估算。`,
                )}
              </p>
              {selected.gapMinutes < 0 && (
                <p className={styles.warning}>
                  <TriangleAlert size={17} aria-hidden="true" />
                  {tr(
                    `Classes overlap by ${Math.abs(selected.gapMinutes)} min`,
                    `คาบเรียนทับซ้อน ${Math.abs(selected.gapMinutes)} นาที`,
                    `课程重叠 ${Math.abs(selected.gapMinutes)} 分钟`,
                  )}
                </p>
              )}
            </div>
          )}
          <div aria-live="polite" aria-atomic="true">
            {campus.isError ? (
              <>
                <Status tone="error">
                  {tr("Campus routes could not be loaded.", "โหลดข้อมูลเส้นทางไม่ได้", "无法加载路线。")}
                </Status>
                <Button onClick={() => void campus.refetch()}>
                  {tr("Retry map data", "ลองอีกครั้ง", "重试地图数据")}
                </Button>
              </>
            ) : campus.isPending ? (
              <PageLoading />
            ) : from && to && (hasUnspecifiedLocation(from) || hasUnspecifiedLocation(to)) ? (
              <Status>
                {tr(
                  "A class location is not specified. Confirm it with the faculty.",
                  "ยังไม่ระบุสถานที่เรียน โปรดตรวจสอบกับคณะ",
                  "课程地点未定，请向院系确认。",
                )}
              </Status>
            ) : from && to && (!origin || !destination) ? (
              <Status>
                {tr(
                  "We have not mapped this building yet. Check your building and room with the faculty.",
                  "ยังไม่มีตำแหน่งอาคารนี้ในแผนที่ โปรดตรวจสอบอาคารและห้องกับคณะ",
                  "该建筑尚未标注，请向院系确认建筑和教室。",
                )}
              </Status>
            ) : from && to && !route ? (
              <Status>
                {tr(
                  "A walking route is not available for these buildings yet. Please check the route on campus.",
                  "ยังไม่มีเส้นทางเดินระหว่างอาคารนี้ โปรดตรวจสอบเส้นทางในมหาวิทยาลัย",
                  "这些建筑之间暂没有步行路线，请在校内确认。",
                )}
              </Status>
            ) : route ? (
              <>
                <div className={styles.metrics}>
                  <div>
                    <Footprints size={19} aria-hidden="true" />
                    <strong>
                      {route.minutes === 0
                        ? tr("Same point", "จุดเดียวกัน", "同一地点")
                        : `~${route.minutes} ${tr("min", "นาที", "分钟")}`}
                    </strong>
                    <span>{tr("walking time", "เวลาเดิน", "步行时间")}</span>
                  </div>
                  <div>
                    <MapPin size={19} aria-hidden="true" />
                    <strong>
                      {Math.round(route.distanceM)} {tr("m", "ม.", "米")}
                    </strong>
                    <span>{tr("walking distance", "ระยะทาง", "步行距离")}</span>
                  </div>
                </div>

                {route.accessNoteRequired && (
                  <p className={styles.note}>
                    {route.hasTunnel
                      ? tr(
                          "Uses a pedestrian tunnel. Opening hours and current access are unverified; check gates and signs on campus.",
                          "เส้นทางผ่านอุโมงค์คนเดิน ยังไม่ยืนยันเวลาเปิดและการเข้าใช้ปัจจุบัน โปรดตรวจสอบประตูและป้ายในพื้นที่",
                          "路线经过人行隧道。开放时间与当前通行情况未核实，请查看校内大门和标识。",
                        )
                      : tr(
                          "Gate hours and current access are unverified. Check gates and signs on campus.",
                          "ยังไม่ยืนยันเวลาเปิดประตูและการเข้าใช้ปัจจุบัน โปรดตรวจสอบประตูและป้ายในพื้นที่",
                          "大门开放时间与当前通行情况未核实，请查看校内大门和标识。",
                        )}
                  </p>
                )}
                <p className={styles.note}>
                  {tr(
                    "Between-building walk. Allow extra time to reach your classroom inside the building.",
                    "เวลาเดินระหว่างอาคาร กรุณาเผื่อเวลาเดินไปยังห้องเรียนภายในอาคาร",
                    "建筑间步行时间。请另留进入建筑并找到教室的时间。",
                  )}
                </p>
              </>
            ) : null}
          </div>
        </section>
        <section
          className={styles.mapPanel}
          aria-label={tr("Campus map", "แผนที่มหาวิทยาลัย", "校园地图")}
        >
          <div className={styles.mapHeader}>
            <span>
              <MapPin size={18} aria-hidden="true" />
              {tr("Chulalongkorn University", "จุฬาลงกรณ์มหาวิทยาลัย", "朱拉隆功大学")}
            </span>
            <span className={styles.badge}>{tr("Campus map", "แผนที่มหาวิทยาลัย", "校园地图")}</span>
          </div>
          <Suspense fallback={<PageLoading />}>
            <CampusMap
              route={route?.points ?? emptyPoints}
              endpoints={endpoints}
              buildings={buildingLabels}
              language={language}
              labels={{
                north: tr("North", "ทิศเหนือ", "北"),
                resetNorth: tr("Point north", "หันไปทิศเหนือ", "朝北"),
                tiltMore: tr("Tilt more", "เพิ่มมุมเอียง", "增大倾角"),
                tiltLess: tr("Tilt less", "ลดมุมเอียง", "减小倾角"),
                map: tr("Campus route map", "แผนที่เส้นทางเดิน", "校园路线地图"),
                loading: tr("Loading the map…", "กำลังโหลดแผนที่…", "正在加载地图…"),
                unavailable: tr(
                  "The map could not be loaded. You can still view your route details.",
                  "โหลดแผนที่ไม่ได้ คุณยังดูรายละเอียดเส้นทางได้",
                  "地图未能加载，您仍可查看路线详情。",
                ),
                retry: tr("Retry map", "ลองโหลดแผนที่อีกครั้ง", "重试地图"),
                origin: tr("From", "จาก", "出发"),
                destination: tr("To", "ไปยัง", "到达"),
                buildings: tr("Building names", "ชื่ออาคาร", "建筑名称"),
                occlusion: tr("Buildings hide the route", "ให้ตึกบังเส้นทาง", "建筑遮挡路线"),
                reset: tr("Show route", "กลับไปที่เส้นทาง", "显示路线"),
                zoomIn: tr("Zoom in", "ซูมเข้า", "放大"),
                zoomOut: tr("Zoom out", "ซูมออก", "缩小"),
                instructions: tr(
                  "Drag or arrows to move; pinch, scroll or +/− to zoom. Right-drag or Shift + arrows to rotate and tilt. Twist two fingers to rotate; use tilt buttons to change angle.",
                  "ลากหรือกดลูกศรเพื่อเลื่อน จีบ เลื่อนล้อเมาส์ หรือกด +/− เพื่อซูม ลากด้วยปุ่มเมาส์ขวาหรือ Shift + ลูกศรเพื่อหมุนและเอียง ใช้สองนิ้วบิดเพื่อหมุน และปุ่มมุมเอียงเพื่อปรับมุมมอง",
                  "拖动或按方向键移动；双指捏合、滚轮或 +/− 缩放。右键拖动或 Shift + 方向键旋转和倾斜。双指扭转可旋转，倾角按钮可调整角度。",
                ),
              }}
            />
          </Suspense>
          <div className={styles.mapFootnote}>
            <span>
              <MapPin size={14} aria-hidden="true" />
              {tr("Approximate building access points", "จุดเข้าถึงอาคารโดยประมาณ", "近似建筑通行点")}
            </span>
            <span>{tr("No location tracking", "ไม่ติดตามตำแหน่ง", "不追踪位置")}</span>
          </div>
        </section>
      </div>
      <section className={styles.routeDetails}>
        <Button
          variant="quiet"
          onClick={() => setShowDetails(!showDetails)}
          aria-expanded={showDetails}
          aria-controls="campus-route-information"
        >
          <Info size={16} aria-hidden="true" />
          {tr("About this route", "ข้อมูลเส้นทาง", "路线说明")}
          <ChevronDown size={15} aria-hidden="true" />
        </Button>
        {showDetails && (
          <div id="campus-route-information" className={styles.detailContent}>
            <p>
              {tr(
                "Walking times use an average outdoor pace of 1.2 m/s and exclude lifts, indoor stairs and crossing waits. Routes may change when gates are closed. Follow signs on campus.",
                "เวลาเดินคำนวณจากความเร็วเฉลี่ยภายนอก 1.2 ม./วินาที ไม่รวมลิฟต์ บันไดภายใน และการรอข้ามถนน เส้นทางอาจเปลี่ยนเมื่อประตูปิด โปรดปฏิบัติตามป้ายในพื้นที่",
                "按室外步速 1.2 米/秒估算，不含乘梯、室内楼梯和等候过街。大门关闭可能影响路线，请遵循现场标识。",
              )}
            </p>
            <p>
              {tr(
                "Access points and map heights are approximate; entrances and current closures have not been verified. Floor labels do not indicate an indoor route.",
                "จุดเข้าถึงและความสูงบนแผนที่เป็นค่าประมาณ ยังไม่ยืนยันประตูทางเข้าหรือการปิดทางล่าสุด ข้อมูลชั้นไม่ได้แสดงเส้นทางภายในอาคาร",
                "通行点和地图高程为近似值，入口与当前封路未核实。楼层标签不代表室内路线。",
              )}
            </p>
            {[origin, destination]
              .filter((building): building is CampusBuilding =>
                Boolean(building && building.codeConfidence !== "official_faculty_source"),
              )
              .filter(
                (building, index, list) =>
                  list.findIndex((entry) => entry.code === building.code) === index,
              )
              .map((building) => (
                <p key={building.code}>
                  {building.code}:{" "}
                  {tr(
                    "location matched to public map records; not independently surveyed",
                    "จับคู่ตำแหน่งจากข้อมูลแผนที่สาธารณะ ยังไม่ได้สำรวจยืนยัน",
                    "位置匹配公共地图记录，未独立测绘核实",
                  )}
                </p>
              ))}
            <a href="https://www.bbtech.sc.chula.ac.th/building/" target="_blank" rel="noreferrer">
              {tr("MHMK / TAB room reference", "ข้อมูลห้อง MHMK / TAB", "MHMK / TAB 教室资料")}
            </a>
          </div>
        )}
      </section>
      <footer className={styles.attribution}>
        ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>{" "}
        ·{" "}
        <a
          href="https://sites.research.google/gr/open-buildings/temporal/"
          target="_blank"
          rel="noreferrer"
        >
          Google Open Buildings (CC BY 4.0)
        </a>
      </footer>
    </div>
  )
}
