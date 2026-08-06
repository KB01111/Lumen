import {useState} from 'react';

import * as stylex from '@stylexjs/stylex';

import type {SessionReliefReport} from '../../services/session-relief/session-relief.schema';
import {LumenButton} from '../../design-system/primitives/LumenButton';
import {LumenText} from '../../design-system/primitives/LumenText';
import {tokens} from '../../design-system/tokens.stylex';
import {SettingSection} from '../settings/components/SettingSection';
import {formatSessionReliefAge, formatSessionReliefBytes, formatSessionReliefCount, formatSessionReliefPercent} from './session-relief-format';

const styles = stylex.create({
  content: {display: 'grid', gap: tokens.space6, padding: tokens.space8},
  row: {display: 'grid', gap: tokens.space3, padding: tokens.space6, backgroundColor: tokens.colorMaterialRaised, borderRadius: tokens.radiusMedium},
  rowDetails: {display: 'flex', flexWrap: 'wrap', gap: tokens.space4},
  localOnly: {paddingInline: tokens.space3},
  depth1: {marginInlineStart: tokens.space8},
  depth2: {marginInlineStart: tokens.space16},
  depth3: {marginInlineStart: tokens.space24},
  depth4: {marginInlineStart: tokens.space32},
});

type ProcessNode = SessionReliefReport['trees'][number]['nodes'][number];

const depthStyles = [undefined, styles.depth1, styles.depth2, styles.depth3, styles.depth4] as const;

function depthStyle(depth: number) {
  return depthStyles[Math.min(Math.max(depth, 0), depthStyles.length - 1)];
}

function treeNodes(tree: SessionReliefReport['trees'][number]) {
  return new Map(tree.nodes.map((node) => [node.pid, node]));
}

function ProcessTreeRow({depth, expanded, node, nodes, toggle}: {depth: number; expanded: Set<number>; node: ProcessNode; nodes: Map<number, ProcessNode>; toggle(pid: number): void}) {
  const hasChildren = node.childPids.some((pid) => nodes.has(pid));
  const isExpanded = expanded.has(node.pid);
  return (
    <>
      <article aria-label={`Process ${node.name} ${node.pid}`} {...stylex.props(styles.row, depthStyle(depth))}>
        <LumenText as="h3" weight="semibold">{node.name} · PID {node.pid}</LumenText>
        <LumenText tone="secondary" variant="meta" className={stylex.props(styles.rowDetails).className}>
          {node.parentPid != null ? `Parent PID ${node.parentPid} · ` : ''}{formatSessionReliefAge(node.ageSeconds)} · {formatSessionReliefPercent(node.cpuPercent)} CPU · {formatSessionReliefBytes(node.memoryBytes)} resident · {formatSessionReliefCount(node.childPids.length)} children{node.detached ? ' · detached' : ''}
        </LumenText>
        {hasChildren ? <LumenButton aria-expanded={isExpanded} aria-label={`${isExpanded ? 'Collapse' : 'Expand'} process tree for ${node.name}`} size="small" variant="quiet" onPress={() => toggle(node.pid)}>{isExpanded ? 'Collapse' : 'Expand'}</LumenButton> : null}
      </article>
      {isExpanded ? node.childPids.map((childPid) => {
        const child = nodes.get(childPid);
        return child ? <ProcessTreeRow key={child.pid} depth={depth + 1} expanded={expanded} node={child} nodes={nodes} toggle={toggle} /> : null;
      }) : null}
    </>
  );
}

export function ProcessTreeList({trees}: {trees: SessionReliefReport['trees']}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [visibleCount, setVisibleCount] = useState(10);
  const visibleTrees = trees.slice(0, visibleCount);
  const toggle = (pid: number) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    return next;
  });
  return (
    <SettingSection title="Local-only process trees" description="PIDs and parent relationships stay on this device and are never included in the safe summary.">
      <div {...stylex.props(styles.content)}>
        <LumenText className={stylex.props(styles.localOnly).className} tone="tertiary" variant="meta">Showing the highest-impact roots first.</LumenText>
        {visibleTrees.map((tree) => {
          const nodes = treeNodes(tree);
          const root = nodes.get(tree.rootPid);
          return root ? <ProcessTreeRow key={tree.rootPid} depth={0} expanded={expanded} node={root} nodes={nodes} toggle={toggle} /> : null;
        })}
        {trees.length > visibleCount ? <LumenButton size="small" variant="quiet" onPress={() => setVisibleCount((count) => count + 10)}>Show more trees</LumenButton> : null}
      </div>
    </SettingSection>
  );
}
