import React from 'react';
import type { Chip, SpecGroup } from '../../content/features.data';
import { ChipRow } from './ChipRow';
import { DetailsPanel } from './DetailsPanel';
import { SpecList } from './SpecList';

type Props = {
  id: string;
  eyebrow: string;
  heading: string;
  /** A trailing substring of `heading` to render in gold, the way the Hero golds "calmer". */
  headingGold?: string;
  body: string;
  chips: Chip[];
  details?: SpecGroup[];
  /** Put the screenshot on the left instead of the right (alternates down the page). */
  reverse?: boolean;
  /** Copy centered above a full-width graphic, for wide or multi-part screenshots. */
  stacked?: boolean;
  /** Extra content rendered inside the open details, below the spec lists. */
  detailsExtra?: React.ReactNode;
  /** The screenshot(s). */
  children: React.ReactNode;
};

const Heading: React.FC<{ heading: string; gold?: string; center?: boolean }> = ({
  heading,
  gold,
  center,
}) => {
  const plain = gold && heading.endsWith(gold) ? heading.slice(0, -gold.length) : heading;
  return (
    <h2
      className={`text-3xl md:text-5xl font-extrabold tracking-tight text-fg leading-[1.1] ${
        center ? 'mx-auto' : ''
      }`}
    >
      {plain}
      {gold && heading.endsWith(gold) && <span className="text-gold">{gold}</span>}
    </h2>
  );
};

export const FeatureBlock: React.FC<Props> = ({
  id,
  eyebrow,
  heading,
  headingGold,
  body,
  chips,
  details,
  reverse,
  stacked,
  detailsExtra,
  children,
}) => {
  const copy = (
    <>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gold">{eyebrow}</p>
      <div className="mt-4">
        <Heading heading={heading} gold={headingGold} center={stacked} />
      </div>
      <p
        className={`mt-5 text-base text-fg-muted leading-relaxed ${
          stacked ? 'max-w-2xl mx-auto' : 'max-w-md'
        }`}
      >
        {body}
      </p>
      <div className={stacked ? 'flex justify-center' : ''}>
        <ChipRow chips={chips} />
      </div>
    </>
  );

  const detailsNode = (details?.length || detailsExtra) && (
    <div className="mt-14 max-w-3xl mx-auto">
      {details?.map((group) => (
        <DetailsPanel key={group.title} label={group.title}>
          <SpecList specs={group.specs} />
        </DetailsPanel>
      ))}
      {detailsExtra}
    </div>
  );

  return (
    <section id={id} className="scroll-mt-28 border-t border-line-subtle py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {stacked ? (
          <>
            <div className="text-center">{copy}</div>
            <div className="mt-14">{children}</div>
          </>
        ) : (
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            <div className={`lg:col-span-5 ${reverse ? 'lg:order-2' : ''}`}>{copy}</div>
            <div className={`lg:col-span-7 ${reverse ? 'lg:order-1' : ''}`}>{children}</div>
          </div>
        )}
        {detailsNode}
      </div>
    </section>
  );
};
