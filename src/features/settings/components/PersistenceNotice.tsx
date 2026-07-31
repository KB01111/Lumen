import {LumenText} from '../../../design-system/primitives/LumenText';
import {useSettingsStore} from '../settings.store';
import {StatusBadge} from './StatusBadge';

export function PersistenceNotice() {
  const status = useSettingsStore((state) => state.persistenceStatus);
  const error = useSettingsStore((state) => state.persistenceError);
  if (status === 'error') {
    return <LumenText role="alert" tone="secondary">{error ?? 'Settings could not be saved.'}</LumenText>;
  }
  if (status === 'saving') {
    return <StatusBadge tone="info">Saving</StatusBadge>;
  }
  return null;
}
