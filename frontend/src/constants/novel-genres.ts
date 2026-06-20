import type { GenreTemplate } from "@/types/novel";

/**
 * Static genre list — mirrors the backend novel_prompts.py templates.
 * Used as a reliable fallback (and primary source) so the UI never
 * shows an empty dropdown even when the backend is offline.
 */
const DEFAULT_OPTIMIZE_OPERATIONS = ["深化冲突", "增强钩子", "强化爽点", "增加反转", "去AI味"];

const makeGenre = (
  key: string,
  name: string,
  optimize_operations: string[] = DEFAULT_OPTIMIZE_OPERATIONS,
): Pick<GenreTemplate, "key" | "name" | "optimize_operations"> => ({
  key,
  name,
  optimize_operations,
});

export const NOVEL_GENRES: Pick<GenreTemplate, "key" | "name" | "optimize_operations">[] = [
  makeGenre("femaleSuspense", "女频悬疑", ["悬念递进", "情绪拉扯", "人物反转", "氛围加强", "去AI味"]),
  makeGenre("westernFantasy", "西方奇幻", ["世界观扩展", "阵营冲突", "史诗冒险", "魔法设定", "去AI味"]),
  makeGenre("orientalImmortal", "东方仙侠", ["问道修行", "机缘奇遇", "宗门纷争", "飞升突破", "去AI味"]),
  makeGenre("ancientRomanceDrama", "古风世情", ["门第冲突", "情感纠葛", "家族博弈", "命运转折", "去AI味"]),
  makeGenre("scifiApocalypse", "科幻末世", ["危机升级", "资源争夺", "文明残响", "生存博弈", "去AI味"]),
  makeGenre("maleDerivative", "男频衍生", ["设定延展", "战力升级", "人物再塑", "世界扩写", "去AI味"]),
  makeGenre("femaleDerivative", "女频衍生", ["情感延展", "人物羁绊", "关系升级", "世界扩写", "去AI味"]),
  makeGenre("republicRomance", "民国言情", ["时代氛围", "身份张力", "虐恋拉扯", "命运沉浮", "去AI味"]),
  makeGenre("urbanMartialArts", "都市高武", ["战力飙升", "都市冲突", "学院对抗", "热血打脸", "去AI味"]),
  makeGenre("supernaturalSuspense", "悬疑灵异", ["灵异氛围", "线索回收", "惊悚升级", "真相反转", "去AI味"]),
  makeGenre("suspenseBrainHole", "悬疑脑洞", ["设定反转", "谜题升级", "因果闭环", "惊奇展开", "去AI味"]),
  makeGenre("warSpy", "抗战谍战", ["身份潜伏", "情报交锋", "生死抉择", "任务升级", "去AI味"]),
  makeGenre("sweetYouth", "青春甜宠", ["校园心动", "甜度提升", "误会修复", "成长陪伴", "去AI味"]),
  makeGenre("doubleMaleLead", "双男主", ["关系推进", "情绪拉扯", "命运绑定", "人物弧光", "去AI味"]),
  makeGenre("ancientBrainHole", "古言脑洞", ["设定创新", "身份反差", "剧情跳点", "反转升级", "去AI味"]),
  makeGenre("historicalAncient", "历史古代", ["朝堂权谋", "历史氛围", "人物成长", "局势升级", "去AI味"]),
  makeGenre("historicalBrainHole", "历史脑洞", ["设定创新", "历史错位", "强反差", "世界重构", "去AI味"]),
  makeGenre("modernRomanceBrainHole", "现言脑洞", ["设定反差", "关系推进", "情节创新", "反转加深", "去AI味"]),
  makeGenre("urbanFarming", "都市种田", ["经营成长", "日常治愈", "财富积累", "生活细节", "去AI味"]),
  makeGenre("urbanBrainHole", "都市脑洞", ["设定创新", "强钩子", "反差爽点", "剧情升级", "去AI味"]),
  makeGenre("urbanDaily", "都市日常", ["生活细节", "人物陪伴", "治愈感", "真实氛围", "去AI味"]),
  makeGenre("fantasyBrainHole", "玄幻脑洞", ["设定展开", "世界重构", "升级反转", "奇观强化", "去AI味"]),
  makeGenre("fantasyRomance", "玄幻言情", ["宿命情感", "世界冲突", "感情推进", "身份反转", "去AI味"]),
  makeGenre("palaceIntrigue", "宫斗宅斗", ["内宅博弈", "人心算计", "逆袭翻盘", "节奏加快", "去AI味"]),
  makeGenre("richFamilyCEO", "豪门总裁", ["豪门对抗", "感情拉扯", "身份反转", "高糖高虐", "去AI味"]),
  makeGenre("warGodSonInLaw", "战神赘婿", ["身份揭晓", "强势打脸", "豪门压制", "逆袭升级", "去AI味"]),
  makeGenre("animeDerivative", "动漫衍生", ["设定延展", "角色再塑", "名场面重构", "世界扩写", "去AI味"]),
  makeGenre("showbizStarlight", "星光璀璨", ["娱乐圈升级", "舆论反转", "事业感情并进", "高光时刻", "去AI味"]),
  makeGenre("gameSports", "游戏体育", ["赛事升级", "团队成长", "热血翻盘", "竞技高光", "去AI味"]),
  makeGenre("workplaceMarriage", "职场婚恋", ["职场博弈", "婚恋推进", "关系反转", "现实张力", "去AI味"]),
  makeGenre("doubleFemaleLead", "双女主", ["关系推进", "命运羁绊", "情绪张力", "人物成长", "去AI味"]),
  makeGenre("traditionalFantasy", "传统玄幻", ["宗门成长", "冒险升级", "世界探索", "热血突破", "去AI味"]),
  makeGenre("urbanCultivation", "都市修真", ["修炼进阶", "都市冲突", "资源争夺", "装逼打脸", "去AI味"]),
  makeGenre("eraStory", "年代", ["时代细节", "生活变迁", "家庭成长", "命运沉浮", "去AI味"]),
  makeGenre("farming", "种田", ["经营成长", "温馨日常", "家长里短", "收获积累", "去AI味"]),
  makeGenre("quickTransmigration", "快穿", ["世界切换", "任务推进", "身份反差", "爽点密集", "去AI味"]),
];

export const GENRE_NAME_MAP: Record<string, string> = Object.fromEntries(
  NOVEL_GENRES.map((g) => [g.key, g.name]),
);
