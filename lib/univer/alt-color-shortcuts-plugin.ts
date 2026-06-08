// Univer Sheets에서 Alt+`·숫자 색상·기호 단축키를 등록하는 플러그인입니다.

import type { IAccessor, ICommand } from "@univerjs/core";
import {
  CommandType,
  EDITOR_ACTIVATED,
  FOCUSING_COMMON_DRAWINGS,
  FOCUSING_SHEET,
  FOCUSING_UNIVER_EDITOR,
  ICommandService,
  IContextService,
  Inject,
  Injector,
  Plugin,
  UniverInstanceType,
} from "@univerjs/core";
import { InsertCommand, IEditorService } from "@univerjs/docs-ui";
import { SetBackgroundColorCommand } from "@univerjs/sheets";
import { SetRangeTextColorCommand, whenSheetEditorActivated } from "@univerjs/sheets-ui";
import { IShortcutService, KeyCode, MetaKeys } from "@univerjs/ui";

const PLUGIN_NAME = "INTEGRATED_BOOKING_CALENDAR_ALT_SHORTCUTS_PLUGIN";

/** 브라우저 keyCode 192 = Backquote(`). KeyCode enum에 없어 리터럴 사용. */
const BACK_QUOTE_KEY = 192;

const InsertSymbolCommandId = "calendar.shortcut.insert-symbol";
const SetPartialFontColorCommandId = "calendar.shortcut.set-partial-font-color";
const SetCellBackgroundColorCommandId = "calendar.shortcut.set-cell-background-color";

const TRIANGLE_SYMBOL = "▶";

type ColorParams = { color: string };

function whenSheetFocused(contextService: IContextService) {
  return (
    contextService.getContextValue(FOCUSING_SHEET) &&
    contextService.getContextValue(FOCUSING_UNIVER_EDITOR) &&
    !contextService.getContextValue(FOCUSING_COMMON_DRAWINGS)
  );
}

function getFocusEditor(accessor: IAccessor) {
  return accessor.get(IEditorService).getFocusEditor();
}

function hasPartialTextSelection(accessor: IAccessor) {
  const editor = getFocusEditor(accessor);
  if (!editor) return false;

  return editor.getSelectionRanges().some((range) => {
    const start = range.startOffset;
    const end = range.endOffset;
    return start != null && end != null && start !== end;
  });
}

const InsertSymbolCommand: ICommand = {
  id: InsertSymbolCommandId,
  type: CommandType.OPERATION,
  handler: async (accessor) => {
    const contextService = accessor.get(IContextService);
    if (!contextService.getContextValue(EDITOR_ACTIVATED)) return false;

    const editor = getFocusEditor(accessor);
    if (!editor) return false;

    const ranges = editor.getSelectionRanges();
    const activeRange = ranges.find((range) => range.isActive) ?? ranges[0];
    if (!activeRange) return false;

    return accessor.get(ICommandService).executeCommand(InsertCommand.id, {
      unitId: editor.getEditorId(),
      body: { dataStream: TRIANGLE_SYMBOL },
      range: activeRange,
      segmentId: activeRange.segmentId,
    });
  },
};

const SetPartialFontColorCommand: ICommand<ColorParams> = {
  id: SetPartialFontColorCommandId,
  type: CommandType.OPERATION,
  handler: async (accessor, params) => {
    if (!params?.color) return false;
    if (!hasPartialTextSelection(accessor)) return false;

    return accessor.get(ICommandService).executeCommand(SetRangeTextColorCommand.id, {
      value: params.color,
    });
  },
};

const SetCellBackgroundColorCommand: ICommand<ColorParams> = {
  id: SetCellBackgroundColorCommandId,
  type: CommandType.OPERATION,
  handler: async (accessor, params) => {
    if (!params?.color) return false;

    return accessor.get(ICommandService).executeCommand(SetBackgroundColorCommand.id, {
      value: params.color,
    });
  },
};

const FONT_COLOR_SHORTCUTS = [
  { binding: KeyCode.Digit1 | MetaKeys.ALT, color: "#000000" }, // RGB(0, 0, 0)
  { binding: KeyCode.Digit2 | MetaKeys.ALT, color: "#980000" }, // RGB(152, 0, 0)
  { binding: KeyCode.Digit3 | MetaKeys.ALT, color: "#334D1A" }, // RGB(51, 77, 26)
  { binding: KeyCode.Digit4 | MetaKeys.ALT, color: "#0000CC" }, // RGB(0, 0, 204)
] as const;

const BACKGROUND_COLOR_SHORTCUTS = [
  { binding: KeyCode.Digit5 | MetaKeys.ALT, color: "#E0F0D1" }, // RGB(224, 240, 209)
  { binding: KeyCode.Digit6 | MetaKeys.ALT, color: "#CFE2F3" }, // RGB(207, 226, 243)
  { binding: KeyCode.Digit7 | MetaKeys.ALT, color: "#FFF2CC" }, // RGB(255, 242, 204)
] as const;

export class UniverSheetsAltColorShortcutsPlugin extends Plugin {
  static override type = UniverInstanceType.UNIVER_SHEET;
  static override pluginName = PLUGIN_NAME;

  constructor(@Inject(Injector) protected readonly _injector: Injector) {
    super();
  }

  override onStarting(): void {
    const commandService = this._injector.get(ICommandService);
    this.disposeWithMe(commandService.registerCommand(InsertSymbolCommand));
    this.disposeWithMe(commandService.registerCommand(SetPartialFontColorCommand));
    this.disposeWithMe(commandService.registerCommand(SetCellBackgroundColorCommand));
  }

  override onRendered(): void {
    const shortcutService = this._injector.get(IShortcutService);

    this.disposeWithMe(
      shortcutService.registerShortcut({
        id: InsertSymbolCommandId,
        binding: BACK_QUOTE_KEY | MetaKeys.ALT,
        preconditions: whenSheetEditorActivated,
      }),
    );

    for (const { binding, color } of FONT_COLOR_SHORTCUTS) {
      this.disposeWithMe(
        shortcutService.registerShortcut({
          id: SetPartialFontColorCommandId,
          binding,
          staticParameters: { color },
          preconditions: whenSheetEditorActivated,
        }),
      );
    }

    for (const { binding, color } of BACKGROUND_COLOR_SHORTCUTS) {
      this.disposeWithMe(
        shortcutService.registerShortcut({
          id: SetCellBackgroundColorCommandId,
          binding,
          staticParameters: { color },
          preconditions: whenSheetFocused,
        }),
      );
    }
  }
}
