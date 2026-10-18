import { useQuery } from "@tanstack/react-query"
import {
  ArrowDown,
  ArrowRight,
  Clock3,
  Footprints,
  MapPin,
  Route,
  TriangleAlert,
} from "lucide-react"
import { lazy, Suspense, useMemo, useState } from "react"
import { useI18n } from "../i18n"
import { Button, SelectField, Status } from "../components/ui"
import { PlanViewTabs } from "../components/PlanViewTabs"
import { PageLoading } from "../components/PageLoading"
import { getSchedule } from "../lib/api"
import {
  campusDays,
  classTransitions,
  formatClassTime,
  makeCampusGraph,
  resolveBuilding,
  roomFloor,
  walkingRoute,
  type CampusBuilding,
  type CampusData,
  type ClassStop,
} from "../lib/campus-navigation"
import pageStyles from "./pages.module.css"
import styles from "./Navigation.module.css"

const CampusMap = lazy(() =>
  import("../components/CampusMap").then((module) => ({ default: module.CampusMap })),
)
async function getCampusData(): Promise<CampusData> {
  const response = await fetch("/campus/navigation-data.json")
  if (!response.ok) throw new Error("Campus map data could not be loaded")
  return response.json() as Promise<CampusData>
}
const emptyPoints: Array<{ x: number; y: number }> = []

export function NavigationPage() {
  const { language, text } = useI18n()
  const tr = (en: string, th: string, zh: string) => text({ en, th, zh })
  const schedule = useQuery({ queryKey: ["schedule"], queryFn: getSchedule })
  const campus = useQuery({
    queryKey: ["campus-navigation"],
    queryFn: getCampusData,
    staleTime: Infinity,
  })
  const [selectedId, setSelectedId] = useState("")
  const [day, setDay] = useState("all")
  const [example, setExample] = useState(false)
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
  const sampleFrom: ClassStop = {
    id: "sample-from",
    courseCode: "",
    name: "",
    day: "",
    start: 0,
    end: 0,
    building: "MHMK",
    room: "M01",
  }
  const sampleTo: ClassStop = { ...sampleFrom, id: "sample-to", building: "TAB", room: "220" }
  const from = example ? sampleFrom : selected?.from
  const to = example ? sampleTo : selected?.to
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
    return [origin, destination].flatMap((building, index) => {
      const point = graph.nodes.get(building.accessNodeId)
      return point
        ? [{ x: point.x, y: point.y, label: `${index === 0 ? "A" : "B"} · ${building.code}` }]
        : []
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
  const stopLabel = (stop: ClassStop) =>
    [stop.building, stop.room].filter(Boolean).join(" ") ||
    tr("Room not assigned", "ยังไม่ระบุห้อง", "教室未定")
  const name = (building: CampusBuilding) =>
    language === "th" ? building.nameTh || building.name : building.name
  const stopCard = (stop: ClassStop, building: CampusBuilding | null, label: string) => {
    const floor = building ? roomFloor(building, stop.room) : null
    return (
      <div className={styles.stop}>
        <span className={styles.stopLetter}>{label}</span>
        <div>
          <strong>{stopLabel(stop)}</strong>
          <span>
            {building
              ? name(building)
              : tr("Building not yet mapped", "ยังไม่มีตำแหน่งอาคารนี้", "该建筑尚未映射")}
          </span>
          {building?.codeConfidence !== "official_faculty_source" && building && (
            <small>
              {tr("Building match: OSM code", "จับคู่อาคารจากรหัส OSM", "建筑匹配：OSM 编号")}
            </small>
          )}
          {!example && (
            <small>
              {stop.courseCode} · {stop.name}
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
  const insufficient = !example && selected && route && selected.gapMinutes < route.minutes

  return (
    <div className={pageStyles.page} data-testid="campus-navigation">
      <header className={pageStyles.pageHeader}>
        <div className={pageStyles.headerBody}>
          <p className={pageStyles.context}>
            {tr("CAMPUS · BETWEEN CLASSES", "ภายในมหาวิทยาลัย · ระหว่างคาบเรียน", "校园 · 课间路线")}
          </p>
          <h1>{tr("Campus routes", "เส้นทางระหว่างอาคาร", "校园路线")}</h1>
          <p>
            {tr(
              "Plan your walk from one class to the next.",
              "วางแผนการเดินจากคาบหนึ่งไปยังคาบถัดไป",
              "规划两节课之间的步行路线。",
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
            <h2>{tr("Between your classes", "การเดินระหว่างคาบ", "课间步行")}</h2>
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
                  setExample(false)
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
                    setExample(false)
                  }}
                  options={visible.map((item) => ({
                    value: item.id,
                    label: `${dayName(item.from.day)} · ${formatClassTime(item.from.end)} · ${item.from.courseCode} → ${item.to.courseCode}`,
                  }))}
                />
              ) : (
                <p className={styles.empty}>
                  {tr(
                    "No consecutive classes on this day. Select another day or explore the example below.",
                    "ไม่มีคาบเรียนต่อเนื่องในวันนี้ เลือกวันอื่นหรือดูเส้นทางตัวอย่างด้านล่าง",
                    "当天没有连续课程。请选择其他日期，或查看下方示例。",
                  )}
                </p>
              )}
            </>
          )}
          <Button
            variant="quiet"
            onClick={() => setExample(!example)}
            disabled={!campus.data}
            aria-pressed={example}
          >
            {example
              ? tr("Back to my classes", "กลับไปยังตารางของฉัน", "返回我的课程")
              : tr("Try MHMK M01 → TAB220", "ดูตัวอย่าง MHMK M01 → TAB220", "示例 MHMK M01 → TAB220")}
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
          {example && (
            <span className={styles.example}>
              {tr(
                "Example route · not your timetable",
                "เส้นทางตัวอย่าง · ไม่ใช่ตารางเรียนของคุณ",
                "示例路线 · 非个人课程表",
              )}
            </span>
          )}
          {from && to && (
            <div className={styles.stops}>
              {stopCard(from, origin, "A")}
              <ArrowDown className={styles.connector} size={18} aria-hidden="true" />
              {stopCard(to, destination, "B")}
            </div>
          )}
          {!example && selected && (
            <p className={insufficient ? styles.warning : styles.gap}>
              <Clock3 size={17} aria-hidden="true" />
              {selected.gapMinutes < 0
                ? tr(
                    `Classes overlap by ${Math.abs(selected.gapMinutes)} min`,
                    `คาบเรียนทับซ้อน ${Math.abs(selected.gapMinutes)} นาที`,
                    `课程重叠 ${Math.abs(selected.gapMinutes)} 分钟`,
                  )
                : tr(
                    `${selected.gapMinutes} min between classes`,
                    `มีเวลา ${selected.gapMinutes} นาทีระหว่างคาบ`,
                    `课间 ${selected.gapMinutes} 分钟`,
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
            ) : from && to && (!origin || !destination) ? (
              <Status>
                {tr(
                  "This building code has no verified map match yet. No route or time estimate is available.",
                  "ยังจับคู่รหัสอาคารนี้กับแผนที่ไม่ได้ จึงยังไม่แสดงเส้นทางหรือเวลาเดิน",
                  "尚无法匹配该建筑编号，因此不显示路线或步行时间。",
                )}
              </Status>
            ) : from && to && !route ? (
              <Status>
                {tr(
                  "No connected pedestrian route is available for these access points.",
                  "ยังไม่มีเส้นทางเดินที่เชื่อมต่อระหว่างจุดเข้าถึงนี้",
                  "这些出入口之间没有连通的步行路线。",
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
                    <span>{tr("outdoors", "ภายนอกอาคาร", "室外")}</span>
                  </div>
                  <div>
                    <MapPin size={19} aria-hidden="true" />
                    <strong>
                      {Math.round(route.distanceM)} {tr("m", "ม.", "米")}
                    </strong>
                    <span>{tr("mapped walking path", "ตามเส้นทางเดิน", "地图步道")}</span>
                  </div>
                </div>

                <p className={styles.note}>
                  {tr(
                    "Outdoor estimate at 1.2 m/s. Add time for lifts, stairs inside buildings and finding your classroom.",
                    "ประมาณเวลาเดินภายนอกที่ 1.2 ม./วินาที เผื่อเวลาลิฟต์ บันไดภายใน และการหาห้องเรียน",
                    "按室外步速 1.2 米/秒估算。请另留乘梯、室内楼梯及寻找教室的时间。",
                  )}
                </p>
                {(route.hasSteps || route.hasSharedRoad) && (
                  <p className={styles.warning}>
                    <TriangleAlert size={17} aria-hidden="true" />
                    {[
                      route.hasSteps ? tr("Includes steps", "มีบันไดในเส้นทาง", "包含台阶") : "",
                      route.hasSharedRoad
                        ? tr("Shared low-speed roads", "บางช่วงใช้ถนนร่วมกับรถ", "部分路段与车辆共用")
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
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
            <span className={styles.badge}>
              {tr("3D route preview", "เส้นทางบนแผนที่ 3 มิติ", "3D 路线预览")}
            </span>
          </div>
          <Suspense fallback={<PageLoading />}>
            <CampusMap
              route={route?.points ?? emptyPoints}
              endpoints={endpoints}
              labels={{
                map: tr("3D campus route map", "แผนที่เส้นทาง 3 มิติ", "3D 校园路线图"),
                loading: tr(
                  "Loading the campus model…",
                  "กำลังโหลดโมเดลมหาวิทยาลัย…",
                  "正在加载校园模型…",
                ),
                unavailable: tr(
                  "The 3D map is unavailable. Route details are still shown on this page.",
                  "แสดงแผนที่ 3 มิติไม่ได้ คุณยังดูรายละเอียดเส้นทางในหน้านี้ได้",
                  "3D 地图不可用，仍可查看本页路线详情。",
                ),
                retry: tr("Retry map", "ลองโหลดแผนที่อีกครั้ง", "重试地图"),
                explore: tr("Explore map", "สำรวจแผนที่", "探索地图"),
                stopExploring: tr("Done exploring", "เสร็จสิ้นการสำรวจ", "结束探索"),
                reset: tr(
                  "Fit route / reset view",
                  "แสดงเส้นทางทั้งหมด / คืนมุมมอง",
                  "显示路线 / 重置视图",
                ),
                zoomIn: tr("Zoom in", "ซูมเข้า", "放大"),
                zoomOut: tr("Zoom out", "ซูมออก", "缩小"),
                instructions: tr(
                  "Choose Explore map to rotate and pan. Zoom buttons always work.",
                  "เลือกสำรวจแผนที่เพื่อหมุนและเลื่อน ใช้ปุ่มซูมได้ตลอด",
                  "选择探索地图以旋转和平移，缩放按钮随时可用。",
                ),
                activeInstructions: tr(
                  "Drag to rotate; two fingers to pan. Arrow keys rotate, +/− zoom, Escape exits.",
                  "ลากเพื่อหมุน ใช้สองนิ้วเลื่อน ปุ่มลูกศรหมุน +/− ซูม และ Escape เพื่อออก",
                  "拖动旋转，双指平移。方向键旋转，+/− 缩放，Escape 退出。",
                ),
              }}
            />
          </Suspense>
          <div className={styles.mapFootnote}>
            <p>
              {tr(
                "Schematic outdoor routes end at approximate access points, not verified entrances. Check gates and local signs; closures and elevations are not live or surveyed.",
                "แนวเส้นทางภายนอกสิ้นสุดที่จุดเข้าถึงโดยประมาณ ยังไม่ยืนยันประตูทางเข้า ตรวจสอบประตูและป้ายในพื้นที่ ไม่มีข้อมูลปิดทางสดหรือระดับความสูงสำรวจ",
                "示意室外路线终点为近似通行点，并非已核实入口。请查看现场标识；不含实时封路或实测高程。",
              )}
            </p>
            <span>
              {tr(
                "View only · no location tracking",
                "ดูเส้นทางเท่านั้น · ไม่ติดตามตำแหน่ง",
                "仅查看路线 · 不追踪位置",
              )}
            </span>
          </div>
        </section>
      </div>
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
        </a>{" "}
        ·{" "}
        <a href="https://www.bbtech.sc.chula.ac.th/building/" target="_blank" rel="noreferrer">
          {tr("MHMK / TAB room reference", "ข้อมูลห้อง MHMK / TAB", "MHMK / TAB 教室资料")}
        </a>
        {origin?.codeConfidence !== "official_faculty_source" && origin
          ? ` · ${tr("Building match: OSM code", "จับคู่อาคารจากรหัส OSM", "建筑匹配：OSM 编号")}`
          : ""}
      </footer>
    </div>
  )
}
