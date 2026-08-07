import * as stylex from '@stylexjs/stylex';

import {LumenUiIcon} from '../../design-system/icons/LumenUiIcon';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import type {ComputerUseController} from './useComputerUseController';

const styles = stylex.create({
  root: {
    minWidth: 0,
    minHeight: 0,
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr) auto',
    flex: 1,
    overflow: 'hidden',
    borderTopColor: tokens.colorBorderSubtle,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space8,
    paddingBlock: tokens.space6,
    paddingInline: tokens.space8,
    borderBottomColor: tokens.colorBorderSubtle,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
  title: {display: 'flex', alignItems: 'center', gap: tokens.space4},
  icon: {color: tokens.colorAccent},
  status: {
    paddingBlock: tokens.space2,
    paddingInline: tokens.space4,
    color: tokens.colorTextSecondary,
    backgroundColor: tokens.colorMaterialInset,
    borderRadius: tokens.radiusRound,
  },
  content: {
    minHeight: 0,
    display: 'grid',
    alignContent: 'start',
    gap: tokens.space8,
    padding: tokens.space10,
    overflowY: 'auto',
  },
  callout: {
    display: 'grid',
    gap: tokens.space4,
    padding: tokens.space8,
    backgroundColor: tokens.colorMaterialTint,
    borderColor: tokens.colorBorderSubtle,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
  },
  task: {
    margin: 0,
    color: tokens.colorTextPrimary,
    fontFamily: tokens.fontFamilyText,
    fontSize: tokens.fontSizeBody,
    lineHeight: tokens.lineHeightRelaxed,
  },
  url: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  activity: {display: 'grid', gap: tokens.space3, margin: 0, padding: 0, listStyle: 'none'},
  activityRow: {display: 'flex', alignItems: 'center', gap: tokens.space4},
  activityDot: {
    width: '6px',
    height: '6px',
    flexShrink: 0,
    backgroundColor: tokens.colorTextTertiary,
    borderRadius: tokens.radiusRound,
  },
  activityDotAccent: {backgroundColor: tokens.colorAccent},
  activityDotSuccess: {backgroundColor: tokens.colorSuccess},
  approval: {
    display: 'grid',
    gap: tokens.space6,
    padding: tokens.space8,
    backgroundColor: tokens.colorAccentMuted,
    borderColor: tokens.colorFocusSoft,
    borderStyle: 'solid',
    borderWidth: '1px',
    borderRadius: tokens.radiusLarge,
  },
  actions: {display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.space4},
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.space6,
    paddingBlock: tokens.space5,
    paddingInline: tokens.space8,
    borderTopColor: tokens.colorBorderSubtle,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
});

function phaseLabel(controller: ComputerUseController) {
  switch (controller.phase) {
    case 'starting': return 'Starting Edge';
    case 'running': return 'Working';
    case 'approval': return 'Approval required';
    case 'completed': return 'Completed';
    case 'cancelled': return 'Stopped';
    case 'error': return 'Unavailable';
    default: return controller.health?.state === 'ready' ? 'Ready' : 'Setup required';
  }
}

export interface ComputerUsePanelProps {
  controller: ComputerUseController;
  draftTask: string;
  cloudConsent: boolean;
  onOpenSettings(): void;
  onStart(): void;
}

export function ComputerUsePanel({
  controller,
  draftTask,
  cloudConsent,
  onOpenSettings,
  onStart,
}: ComputerUsePanelProps) {
  const active = controller.phase === 'starting' || controller.phase === 'running' || controller.phase === 'approval';
  const setupReady = controller.health?.state === 'ready'
    && controller.health.credentialConfigured
    && cloudConsent;
  const setupMessage = !controller.health
    ? 'Checking the local Computer Use worker…'
    : controller.health.state !== 'ready'
      ? controller.health.detail ?? 'The Computer Use worker is unavailable.'
      : !controller.health.credentialConfigured
        ? 'Add a Gemini API key in Computer Use settings.'
        : !cloudConsent
          ? 'Review and grant browser screenshot consent in Computer Use settings.'
          : 'A separate Microsoft Edge session will carry out this browser-only task.';

  return (
    <section aria-label="Computer Use workspace" {...stylex.props(styles.root)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.title)}>
          <LumenUiIcon name="computer" size="medium" {...stylex.props(styles.icon)} />
          <LumenText weight="semibold">Computer Use</LumenText>
          <LumenText tone="tertiary" variant="meta">Gemini · browser only</LumenText>
        </div>
        <LumenText variant="caption" {...stylex.props(styles.status)}>{phaseLabel(controller)}</LumenText>
      </header>
      <div {...stylex.props(styles.content)}>
        <div {...stylex.props(styles.callout)}>
          <LumenText weight="medium">Protected browser session</LumenText>
          <LumenText tone="secondary" variant="meta">{setupMessage}</LumenText>
          <LumenText tone="tertiary" variant="caption">
            Lumen sends the task and browser screenshots to Gemini. File URLs and desktop control are blocked; sensitive actions pause here for approval.
          </LumenText>
        </div>
        {controller.task ? (
          <div {...stylex.props(styles.callout)}>
            <LumenText tone="tertiary" variant="caption">Current task</LumenText>
            <p {...stylex.props(styles.task)}>{controller.task}</p>
            {controller.currentUrl ? (
              <LumenText className={stylex.props(styles.url).className} tone="tertiary" variant="caption">
                {controller.currentUrl}
              </LumenText>
            ) : null}
          </div>
        ) : null}
        {controller.reasoning ? (
          <div aria-live="polite" {...stylex.props(styles.callout)}>
            <LumenText tone="tertiary" variant="caption">Agent update</LumenText>
            <LumenText tone="secondary">{controller.reasoning}</LumenText>
          </div>
        ) : null}
        {controller.approval ? (
          <div role="alertdialog" aria-label="Approve Computer Use action" {...stylex.props(styles.approval)}>
            <LumenText weight="semibold">Gemini needs your approval</LumenText>
            <LumenText tone="secondary">{controller.approval.explanation}</LumenText>
            <div {...stylex.props(styles.actions)}>
              <LumenButton variant="primary" onPress={() => void controller.approve()}>
                <LumenUiIcon name="success" size="small" /> Approve once
              </LumenButton>
              <LumenButton variant="quiet" onPress={() => void controller.deny()}>
                <LumenUiIcon name="close" size="small" /> Deny and stop
              </LumenButton>
            </div>
          </div>
        ) : null}
        {controller.summary ? (
          <div aria-live="polite" {...stylex.props(styles.callout)}>
            <LumenText weight="medium">Task complete</LumenText>
            <LumenText tone="secondary">{controller.summary}</LumenText>
          </div>
        ) : null}
        {controller.error ? (
          <div role="alert" {...stylex.props(styles.callout)}>
            <LumenText weight="medium">Computer Use could not continue</LumenText>
            <LumenText tone="secondary">{controller.error}</LumenText>
          </div>
        ) : null}
        {controller.activity.length > 0 ? (
          <ul aria-label="Computer Use activity" {...stylex.props(styles.activity)}>
            {controller.activity.map((item) => (
              <li key={item.id} {...stylex.props(styles.activityRow)}>
                <span aria-hidden="true" {...stylex.props(
                  styles.activityDot,
                  item.tone === 'accent' && styles.activityDotAccent,
                  item.tone === 'success' && styles.activityDotSuccess,
                )} />
                <LumenText tone="secondary" variant="meta">{item.label}</LumenText>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <footer {...stylex.props(styles.footer)}>
        <LumenText tone="tertiary" variant="caption">
          {controller.model ?? 'gemini-3.6-flash'} · {controller.browser ?? 'Microsoft Edge'}
        </LumenText>
        <div {...stylex.props(styles.actions)}>
          {!setupReady && !active ? (
            <LumenButton size="small" variant="quiet" onPress={onOpenSettings}>
              <LumenUiIcon name="settings" size="small" /> Open settings
            </LumenButton>
          ) : null}
          {active ? (
            <LumenButton size="small" variant="quiet" onPress={controller.stop}>
              <LumenUiIcon name="stop" size="small" /> Stop
            </LumenButton>
          ) : (
            <LumenButton isDisabled={!setupReady || !draftTask.trim()} size="small" variant="primary" onPress={onStart}>
              <LumenUiIcon name="computer" size="small" /> Run in Edge
            </LumenButton>
          )}
        </div>
      </footer>
    </section>
  );
}
