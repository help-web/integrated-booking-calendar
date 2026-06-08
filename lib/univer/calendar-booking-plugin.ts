// 행사 셀 계약 상태 컨텍스트 메뉴·값 변경 시 회의실 행 자동 갱신 플러그인입니다.

import type { Dependency, IAccessor, ICommand } from "@univerjs/core";
import {
  CommandType,
  Disposable,
  ICommandService,
  Inject,
  Injector,
  Plugin,
  touchDependencies,
  UniverInstanceType,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { Observable } from "rxjs";
import {
  ContextMenuGroup,
  ContextMenuPosition,
  IMenuManagerService,
  type IMenuButtonItem,
  type IMenuSelectorItem,
  MenuItemType,
} from "@univerjs/ui";
import type { ContractStatus, ContractStatusKind } from "@/lib/calendar/contract-status";
import { CONTRACT_STATUS_OPTIONS } from "@/lib/calendar/contract-status";
import {
  getCellPlainText,
  parseEventCellText,
  updateEventBlockStatus,
} from "@/lib/calendar/event-text-parser";
import { isEventRow } from "@/lib/calendar/grid";
import type { ParseIssue } from "@/lib/calendar/event-text-parser";
import { syncDayRoomsFromEventCell } from "@/lib/calendar/sync-day-rooms";

const PLUGIN_NAME = "INTEGRATED_BOOKING_CALENDAR_BOOKING_PLUGIN";
const CONTRACT_STATUS_MENU_ID = "calendar.menu.contract-status";

export type CalendarBookingPluginConfig = {
  onParseIssues?: (issues: ParseIssue[]) => void;
};

type SetContractStatusParams = {
  kind: ContractStatusKind;
  blockIndex?: number;
};

function commandIdForStatus(kind: ContractStatusKind) {
  return `calendar.command.set-contract-status.${kind}`;
}

function createStatusCommand(kind: ContractStatusKind): ICommand<SetContractStatusParams> {
  return {
    id: commandIdForStatus(kind),
    type: CommandType.OPERATION,
    handler: async (accessor, params) => {
      const option = CONTRACT_STATUS_OPTIONS.find((item) => item.kind === kind);
      if (!option) return false;

      const status = await buildContractStatus(option, params?.blockIndex);
      if (!status) return false;

      return applyContractStatus(accessor, status, params?.blockIndex ?? 0);
    },
  };
}

async function buildContractStatus(
  option: (typeof CONTRACT_STATUS_OPTIONS)[number],
  _blockIndex?: number,
): Promise<ContractStatus | null> {
  if (!option.needsDate) {
    return { kind: option.kind } as ContractStatus;
  }

  const input = window.prompt(`${option.label} 날짜를 입력하세요. (예: 2026-03-15)`);
  if (!input?.trim()) return null;

  const date = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    window.alert("날짜 형식은 YYYY-MM-DD 이어야 합니다.");
    return null;
  }

  if (option.kind === "contract_complete") return { kind: "contract_complete", date };
  if (option.kind === "reservation_complete") return { kind: "reservation_complete", date };
  return null;
}

function getFacadeAPI(accessor: IAccessor) {
  return FUniver.newAPI(accessor.get(Injector));
}

function applyContractStatus(
  accessor: IAccessor,
  status: ContractStatus,
  blockIndex: number,
): boolean {
  const univerAPI = getFacadeAPI(accessor);
  const fWorkbook = univerAPI.getActiveWorkbook();
  if (!fWorkbook) return false;

  const fWorksheet = fWorkbook.getActiveSheet();
  if (!fWorksheet) return false;

  const fRange = fWorksheet.getActiveRange();
  if (!fRange) return false;

  const row = fRange.getRow();
  const col = fRange.getColumn();
  if (!isEventRow(row)) return false;

  const currentText = getCellPlainText(fRange.getValue(true));
  const parsed = parseEventCellText(currentText);

  let targetBlockIndex = blockIndex;
  if (parsed.blocks.length === 0) {
    window.alert("행사 블록이 없습니다. 행사 제목 등을 먼저 입력하세요.");
    return false;
  }

  if (parsed.blocks.length > 1 && blockIndex === 0) {
    const picked = window.prompt(
      `이 셀에 행사가 ${parsed.blocks.length}개 있습니다. 적용할 행사 번호(1~${parsed.blocks.length})를 입력하세요.`,
      "1",
    );
    if (!picked?.trim()) return false;
    const num = Number(picked.trim());
    if (!Number.isInteger(num) || num < 1 || num > parsed.blocks.length) {
      window.alert("올바른 행사 번호가 아닙니다.");
      return false;
    }
    targetBlockIndex = num - 1;
  }

  const nextText = updateEventBlockStatus(currentText, targetBlockIndex, status);
  fRange.setValueForCell(nextText);

  const issues = syncDayRoomsFromEventCell(univerAPI, fWorksheet, row, col).issues;
  publishIssues(accessor, issues);
  return true;
}

class CalendarBookingConfigHolder {
  constructor(public readonly config: CalendarBookingPluginConfig) {}
}

function publishIssues(accessor: IAccessor, issues: ParseIssue[]) {
  const holder = accessor.get(CalendarBookingConfigHolder);
  holder.config.onParseIssues?.(issues);
}

function isActiveCellEventRow(accessor: IAccessor): boolean {
  const univerAPI = getFacadeAPI(accessor);
  const range = univerAPI.getActiveWorkbook()?.getActiveSheet()?.getActiveRange();
  if (!range) return false;
  return isEventRow(range.getRow());
}

function contractStatusMenuFactory(accessor: IAccessor): IMenuSelectorItem<string> {
  return {
    id: CONTRACT_STATUS_MENU_ID,
    type: MenuItemType.SUBITEMS,
    title: "계약 상태",
    hidden$: new Observable((subscriber) => {
      subscriber.next(!isActiveCellEventRow(accessor));
      const univerAPI = getFacadeAPI(accessor);
      const sub = univerAPI.addEvent(univerAPI.Event.SheetEditEnded, () => {
        subscriber.next(!isActiveCellEventRow(accessor));
      });
      return () => sub.dispose();
    }),
  };
}

function statusMenuItemFactory(kind: ContractStatusKind): (accessor: IAccessor) => IMenuButtonItem<string> {
  const option = CONTRACT_STATUS_OPTIONS.find((item) => item.kind === kind)!;
  return () => ({
    id: commandIdForStatus(kind),
    type: MenuItemType.BUTTON,
    title: option.label,
  });
}

class CalendarBookingController extends Disposable {
  constructor(
    @Inject(Injector) private readonly _injector: Injector,
    @ICommandService private readonly _commandService: ICommandService,
    @IMenuManagerService private readonly _menuManagerService: IMenuManagerService,
    @Inject(CalendarBookingConfigHolder)
    private readonly _configHolder: CalendarBookingConfigHolder,
  ) {
    super();
    this._initCommands();
    this._initMenus();
    this._initSheetValueListener();
  }

  private _initCommands(): void {
    for (const option of CONTRACT_STATUS_OPTIONS) {
      this.disposeWithMe(this._commandService.registerCommand(createStatusCommand(option.kind)));
    }
  }

  private _initMenus(): void {
    const children: Record<string, { order: number; menuItemFactory: (accessor: IAccessor) => IMenuButtonItem<string> }> =
      {};

    CONTRACT_STATUS_OPTIONS.forEach((option, index) => {
      children[commandIdForStatus(option.kind)] = {
        order: index,
        menuItemFactory: statusMenuItemFactory(option.kind),
      };
    });

    this._menuManagerService.mergeMenu({
      [ContextMenuPosition.MAIN_AREA]: {
        [ContextMenuGroup.DATA]: {
          [CONTRACT_STATUS_MENU_ID]: {
            order: 5,
            menuItemFactory: contractStatusMenuFactory,
            ...children,
          },
        },
      },
    });
  }

  private _initSheetValueListener(): void {
    const univerAPI = FUniver.newAPI(this._injector);
    this.disposeWithMe(
      univerAPI.addEvent(univerAPI.Event.SheetValueChanged, (params) => {
        const fWorkbook = univerAPI.getActiveWorkbook();
        const fWorksheet = fWorkbook?.getActiveSheet();
        if (!fWorksheet) return;

        for (const range of params.effectedRanges) {
          const row = range.getRow();
          const col = range.getColumn();
          if (!isEventRow(row)) continue;

          const issues = syncDayRoomsFromEventCell(univerAPI, fWorksheet, row, col).issues;
          this._configHolder.config.onParseIssues?.(issues);
        }
      }),
    );
  }
}

export class UniverSheetsCalendarBookingPlugin extends Plugin {
  static override type = UniverInstanceType.UNIVER_SHEET;
  static override pluginName = PLUGIN_NAME;

  private readonly _config: CalendarBookingPluginConfig;

  constructor(
    config: CalendarBookingPluginConfig = {},
    @Inject(Injector) protected readonly _injector: Injector,
  ) {
    super();
    this._config = config;
  }

  override onStarting(): void {
    ([
      [CalendarBookingConfigHolder, { useValue: new CalendarBookingConfigHolder(this._config) }],
      [CalendarBookingController],
    ] as Dependency[]).forEach((dep) => this._injector.add(dep));
  }

  override onRendered(): void {
    touchDependencies(this._injector, [[CalendarBookingController]]);
  }
}
