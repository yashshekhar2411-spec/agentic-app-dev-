import { StyleProp, Text, TextStyle } from 'react-native';

import { useNow } from '@/hooks/useNow';
import { duration, timeAgo } from '@/utils/time';

interface Props {
  since: string;
  until?: string | null;
  /** duration = "1:05" timer · ago = "3m ago" · waiting = "waiting 3m" */
  mode?: 'duration' | 'ago' | 'waiting';
  every?: number;
  style?: StyleProp<TextStyle>;
}

/** A self-refreshing time label, so only this text re-renders each tick instead of the whole screen. */
export function Elapsed({ since, until, mode = 'duration', every = 1000, style }: Props) {
  useNow(until ? 0 : every);
  const text =
    mode === 'duration'
      ? duration(since, until)
      : mode === 'ago'
        ? timeAgo(since)
        : `waiting ${timeAgo(since).replace(' ago', '')}`;
  return <Text style={style}>{text}</Text>;
}
