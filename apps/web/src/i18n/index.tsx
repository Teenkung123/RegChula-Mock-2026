import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react"

export type AppLanguage = "th" | "en" | "zh"

type MessageTable = Record<string, string>

const messages: Record<AppLanguage, MessageTable> = {
  th: {
    "app.name": "RegChula",
    "app.demo": "ระบบตัวอย่าง",
    "nav.work": "การทำงาน",
    "nav.manage": "จัดการ",
    "nav.plan": "แผนการเรียน",
    "nav.dashboard": "ภาพรวม",
    "nav.search": "ค้นหารายวิชา",
    "nav.register": "ลงทะเบียน",
    "nav.drop": "ลดรายวิชา",
    "nav.withdraw": "ถอนรายวิชา",
    "nav.schedule": "ตารางเรียน",
    "nav.exams": "ตารางสอบ",
    "nav.buildings": "รายชื่ออาคาร",
    "nav.faculties": "ค้นหาคณะ / ภาควิชา",
    "nav.appearance": "การแสดงผล",
    "common.search": "ค้นหา",
    "common.close": "ปิด",
    "common.save": "บันทึก",
    "common.reset": "คืนค่าเริ่มต้น",
    "common.cancel": "ยกเลิก",
    "common.currentTerm": "ภาคปัจจุบัน",
    "common.loading": "กำลังโหลด",
    "shell.searchPrompt": "ค้นหารหัสหรือชื่อวิชา",
    "shell.skipContent": "ข้ามไปเนื้อหา",
    "shell.searchHint": "พิมพ์รหัสวิชา ชื่อไทย ชื่ออังกฤษ หรือชื่อย่อ",
    "shell.advancedSearch": "ค้นหาแบบละเอียด",
    "shell.more": "เพิ่มเติม",
    "shell.allMenu": "เมนูทั้งหมด",
    "shell.closeNavigation": "ปิดเมนู",
    "shell.primaryNavigation": "เมนูหลัก",
    "shell.profile": "โปรไฟล์และการตั้งค่า",
    "shell.language": "ภาษา",
    "shell.mode": "โหมดสี",
    "shell.toggleTheme": "สลับโหมดสว่างและมืด",
    "shell.appearance": "การแสดงผล",
    "shell.logout": "ออกจากระบบ",
    "shell.importedData": "ข้อมูลรายวิชาจากไฟล์ที่นำเข้า · ระบบตัวอย่าง",
    "appearance.title": "การแสดงผลและการอ่าน",
    "appearance.subtitle": "ตั้งค่าภาษา ขนาดส่วนติดต่อ สี และรูปแบบหน้าจอให้เหมาะกับคุณ",
    "appearance.language": "ภาษาที่ใช้แสดงผล",
    "appearance.readability": "การอ่านและการเข้าถึง",
    "appearance.color": "ธีมและสีเน้น",
    "appearance.layout": "รูปแบบหน้าจอ",
    "appearance.behavior": "วิธีเปิดรายละเอียดรายวิชา",
    "appearance.system": "ตามการตั้งค่าของอุปกรณ์",
    "appearance.systemShort": "ระบบ",
    "appearance.light": "โหมดสว่าง",
    "appearance.lightShort": "สว่าง",
    "appearance.dark": "โหมดมืด",
    "appearance.darkShort": "มืด",
    "appearance.scale": "ขนาดส่วนติดต่อ",
    "appearance.width": "ความกว้างเนื้อหา",
    "appearance.contentLayout": "การจัดวางเนื้อหา",
    "appearance.fluid": "เต็มความกว้างหน้าจอ",
    "appearance.contained": "จำกัดความกว้าง",
    "appearance.fluidHint": "ใช้พื้นที่ว่างข้างเมนูให้เต็มจอ รวมถึงจออัลตร้าไวด์",
    "appearance.labelStyle": "รูปแบบป้ายกำกับ",
    "appearance.soft": "ป้ายโทนอ่อน",
    "appearance.solid": "ป้ายโทนทึบ",
    "appearance.detail": "วิธีแสดงรายละเอียดรายวิชา",
    "appearance.drawer": "แผงด้านข้าง",
    "appearance.modal": "หน้าต่างกลางจอ",
    "appearance.accent": "สีเน้น",
    "appearance.customColor": "เลือกสีเอง",
    "appearance.preview": "ตัวอย่าง",
    "appearance.saved": "บันทึกการตั้งค่าแล้ว",
    "appearance.saving": "กำลังบันทึกการตั้งค่า",
    "appearance.saveError": "บันทึกการตั้งค่าไม่ได้ ลองอีกครั้ง",
    "appearance.resetConfirm": "ต้องการคืนค่าการแสดงผลทั้งหมดเป็นค่าเริ่มต้นหรือไม่",
    "buildings.context": "ข้อมูลอาคาร",
    "buildings.title": "รายชื่ออาคาร",
    "buildings.subtitle": "ค้นหารหัสหรือชื่ออาคารจากรายชื่ออาคารสาธารณะของจุฬาลงกรณ์มหาวิทยาลัย",
    "buildings.search": "ค้นหารหัสหรือชื่ออาคาร",
    "buildings.count": "พบ {count} อาคาร",
    "buildings.source": "ข้อมูลจากรายชื่ออาคารสาธารณะของจุฬาลงกรณ์มหาวิทยาลัย",
    "buildings.empty": "ไม่พบอาคารที่ตรงกับคำค้น",
    "faculties.context": "ข้อมูลหน่วยงาน",
    "faculties.title": "ค้นหารหัสคณะและภาควิชา",
    "faculties.subtitle": "ค้นหารหัสหรือชื่อคณะและภาควิชาจากรายชื่อสาธารณะของจุฬาลงกรณ์มหาวิทยาลัย",
    "faculties.search": "ค้นหารหัสหรือชื่อคณะ / ภาควิชา",
    "faculties.count": "พบ {faculties} คณะ / {departments} ภาควิชา / {fields} สาขาวิชา",
    "faculties.departments": "{count} ภาควิชา",
    "faculties.fields": "{count} สาขาวิชา",
    "faculties.source": "ข้อมูลจากรายชื่อคณะและภาควิชาสาธารณะของจุฬาลงกรณ์มหาวิทยาลัย",
    "faculties.empty": "ไม่พบคณะหรือภาควิชาที่ตรงกับคำค้น",
    "login.checking": "กำลังตรวจสอบเซสชัน",
    "login.opening": "กำลังเปิดหน้า",
  },
  en: {
    "app.name": "RegChula",
    "app.demo": "Demo system",
    "nav.work": "Workspace",
    "nav.manage": "Manage",
    "nav.plan": "Plan",
    "nav.dashboard": "Overview",
    "nav.search": "Course search",
    "nav.register": "Register",
    "nav.drop": "Drop course",
    "nav.withdraw": "Withdraw course",
    "nav.schedule": "Schedule",
    "nav.exams": "Exams",
    "nav.buildings": "Buildings",
    "nav.faculties": "Faculties & departments",
    "nav.appearance": "Appearance",
    "common.search": "Search",
    "common.close": "Close",
    "common.save": "Save",
    "common.reset": "Restore defaults",
    "common.cancel": "Cancel",
    "common.currentTerm": "Current term",
    "common.loading": "Loading",
    "shell.searchPrompt": "Search course code or title",
    "shell.skipContent": "Skip to content",
    "shell.searchHint": "Enter a code, Thai or English title, or abbreviation",
    "shell.advancedSearch": "Advanced search",
    "shell.more": "More",
    "shell.allMenu": "All navigation",
    "shell.closeNavigation": "Close navigation",
    "shell.primaryNavigation": "Primary navigation",
    "shell.profile": "Profile and settings",
    "shell.language": "Language",
    "shell.mode": "Color mode",
    "shell.toggleTheme": "Toggle light and dark mode",
    "shell.appearance": "Appearance",
    "shell.logout": "Sign out",
    "shell.importedData": "Imported course data · demo system",
    "appearance.title": "Display and readability",
    "appearance.subtitle": "Set your language, interface size, colors, and layout.",
    "appearance.language": "Display language",
    "appearance.readability": "Readability",
    "appearance.color": "Theme and accent",
    "appearance.layout": "Page layout",
    "appearance.behavior": "How course details open",
    "appearance.system": "Match your device setting",
    "appearance.systemShort": "System",
    "appearance.light": "Light mode",
    "appearance.lightShort": "Light",
    "appearance.dark": "Dark mode",
    "appearance.darkShort": "Dark",
    "appearance.scale": "Interface size",
    "appearance.width": "Content width",
    "appearance.contentLayout": "Content layout",
    "appearance.fluid": "Full width",
    "appearance.contained": "Contained width",
    "appearance.fluidHint": "Fill the space beside the navigation, including ultra-wide displays.",
    "appearance.labelStyle": "Label style",
    "appearance.soft": "Soft labels",
    "appearance.solid": "Solid labels",
    "appearance.detail": "Course detail view",
    "appearance.drawer": "Side panel",
    "appearance.modal": "Centered dialog",
    "appearance.accent": "Accent color",
    "appearance.customColor": "Choose a color",
    "appearance.preview": "Preview",
    "appearance.saved": "Settings saved",
    "appearance.saving": "Saving settings",
    "appearance.saveError": "Couldn't save your settings. Try again.",
    "appearance.resetConfirm": "Reset all display settings?",
    "buildings.context": "Campus information",
    "buildings.title": "Building directory",
    "buildings.subtitle":
      "Search the public Chulalongkorn University building directory by code or name.",
    "buildings.search": "Search building code or name",
    "buildings.count": "{count} buildings found",
    "buildings.source": "Data from Chulalongkorn University's public building directory.",
    "buildings.empty": "No buildings match your search.",
    "faculties.context": "Academic units",
    "faculties.title": "Faculty and department directory",
    "faculties.subtitle":
      "Search public Chulalongkorn University faculty and department codes or names.",
    "faculties.search": "Search faculty or department code or name",
    "faculties.count":
      "{faculties} faculties / {departments} departments / {fields} fields of study",
    "faculties.departments": "{count} departments",
    "faculties.fields": "{count} fields of study",
    "faculties.source":
      "Data from Chulalongkorn University's public faculty and department directory.",
    "faculties.empty": "No faculty or department matches your search.",
    "login.checking": "Checking session",
    "login.opening": "Opening page",
  },
  zh: {
    "app.name": "RegChula",
    "app.demo": "演示系统",
    "nav.work": "工作区",
    "nav.manage": "管理",
    "nav.plan": "学习计划",
    "nav.dashboard": "概览",
    "nav.search": "课程搜索",
    "nav.register": "选课",
    "nav.drop": "退选课程",
    "nav.withdraw": "退课",
    "nav.schedule": "课程表",
    "nav.exams": "考试",
    "nav.buildings": "建筑列表",
    "nav.faculties": "院系查询",
    "nav.appearance": "显示设置",
    "common.search": "搜索",
    "common.close": "关闭",
    "common.save": "保存",
    "common.reset": "恢复默认设置",
    "common.cancel": "取消",
    "common.currentTerm": "当前学期",
    "common.loading": "加载中",
    "shell.searchPrompt": "搜索课程代码或名称",
    "shell.skipContent": "跳至内容",
    "shell.searchHint": "输入课程代码、泰文或英文名称、或缩写",
    "shell.advancedSearch": "高级搜索",
    "shell.more": "更多",
    "shell.allMenu": "全部导航",
    "shell.closeNavigation": "关闭导航",
    "shell.primaryNavigation": "主导航",
    "shell.profile": "个人资料与设置",
    "shell.language": "语言",
    "shell.mode": "显示模式",
    "shell.toggleTheme": "切换浅色和深色模式",
    "shell.appearance": "显示设置",
    "shell.logout": "退出登录",
    "shell.importedData": "已导入课程数据 · 演示系统",
    "appearance.title": "显示与阅读体验",
    "appearance.subtitle": "调整显示语言、界面大小、配色和页面布局。",
    "appearance.language": "显示语言",
    "appearance.readability": "阅读体验",
    "appearance.color": "主题与强调色",
    "appearance.layout": "页面布局",
    "appearance.behavior": "课程详情打开方式",
    "appearance.system": "跟随设备设置",
    "appearance.systemShort": "系统",
    "appearance.light": "浅色模式",
    "appearance.lightShort": "浅色",
    "appearance.dark": "深色模式",
    "appearance.darkShort": "深色",
    "appearance.scale": "界面大小",
    "appearance.width": "内容宽度",
    "appearance.contentLayout": "内容布局",
    "appearance.fluid": "全宽布局",
    "appearance.contained": "限制宽度",
    "appearance.fluidHint": "填满导航旁的可用空间，也适用于超宽显示器。",
    "appearance.labelStyle": "标签样式",
    "appearance.soft": "柔和标签",
    "appearance.solid": "实心标签",
    "appearance.detail": "课程详情展示方式",
    "appearance.drawer": "侧边面板",
    "appearance.modal": "居中对话框",
    "appearance.accent": "强调色",
    "appearance.customColor": "选择颜色",
    "appearance.preview": "预览",
    "appearance.saved": "设置已保存",
    "appearance.saving": "正在保存设置",
    "appearance.saveError": "无法保存设置，请重试。",
    "appearance.resetConfirm": "要将所有显示设置恢复为默认值吗？",
    "buildings.context": "校园信息",
    "buildings.title": "建筑列表",
    "buildings.subtitle": "可按代码或名称搜索公开的朱拉隆功大学建筑列表。",
    "buildings.search": "搜索建筑代码或名称",
    "buildings.count": "找到 {count} 栋建筑",
    "buildings.source": "数据来自朱拉隆功大学公开建筑列表。",
    "buildings.empty": "没有符合搜索条件的建筑。",
    "faculties.context": "院系信息",
    "faculties.title": "院系代码查询",
    "faculties.subtitle": "按代码或名称搜索朱拉隆功大学公开的院系目录。",
    "faculties.search": "搜索院系代码或名称",
    "faculties.count": "{faculties} 个学院 / {departments} 个系 / {fields} 个专业",
    "faculties.departments": "{count} 个系",
    "faculties.fields": "{count} 个专业",
    "faculties.source": "数据来自朱拉隆功大学公开院系目录。",
    "faculties.empty": "没有符合搜索条件的院系。",
    "login.checking": "正在检查会话",
    "login.opening": "正在打开页面",
  },
}

type Interpolation = Record<string, string | number>

function interpolate(message: string, values?: Interpolation) {
  if (!values) return message
  return Object.entries(values).reduce(
    (result, [name, value]) => result.replaceAll("{" + name + "}", String(value)),
    message,
  )
}

const localeMap: Record<AppLanguage, string> = {
  th: "th-TH",
  en: "en-US",
  zh: "zh-CN",
}

type I18nValue = {
  language: AppLanguage
  locale: string
  t: (key: string, values?: Interpolation) => string
  text: (values: Record<AppLanguage, string>) => string
  courseName: (course: { nameTh: string; nameEn: string }) => string
  courseSecondaryName: (course: { nameTh: string; nameEn: string }) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function LocaleProvider({
  language,
  children,
}: {
  language: AppLanguage
  children: ReactNode
}) {
  const safeLanguage: AppLanguage = language === "en" || language === "zh" ? language : "th"
  const value = useMemo<I18nValue>(
    () => ({
      language: safeLanguage,
      locale: localeMap[safeLanguage],
      t: (key, values) =>
        interpolate(messages[safeLanguage][key] ?? messages.th[key] ?? key, values),
      text: (values) => values[safeLanguage] ?? values.th,
      courseName: (course) =>
        safeLanguage === "th" ? course.nameTh || course.nameEn : course.nameEn || course.nameTh,
      courseSecondaryName: (course) =>
        safeLanguage === "th" ? course.nameEn : course.nameTh || course.nameEn,
    }),
    [safeLanguage],
  )

  useEffect(() => {
    document.documentElement.lang =
      safeLanguage === "zh" ? "zh-CN" : safeLanguage === "en" ? "en" : "th"
    document.documentElement.dataset.language = safeLanguage
  }, [safeLanguage])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const value = useContext(I18nContext)
  if (!value) throw new Error("LocaleProvider is missing")
  return value
}

export function formatTerm(language: AppLanguage, academicYear: number, semester: number) {
  const term = String(academicYear) + "/" + String(semester)
  return language === "zh" ? term + " 学期" : term
}
