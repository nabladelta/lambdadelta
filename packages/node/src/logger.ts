import { Logger } from "tslog"
import { LOGLEVEL, SECRET } from "./constants"

export const mainLogger = new Logger({
    prettyLogTemplate: "{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}:{{ms}} {{logLevelName}}\t[{{name}}]\t",
    maskValuesOfKeys: [SECRET!],
    minLevel: LOGLEVEL
})