import React from 'react';
import { CALENDAR, DAILY, FINDER, FOCUS, PLANNER, TASKS, XP } from '../content/features.data';
import { FeatureBlock } from '../components/features/FeatureBlock';
import { FeaturesHero } from '../components/features/FeaturesHero';
import { ScreenFrame } from '../components/features/ScreenFrame';
import { ScrollSpyRail } from '../components/features/ScrollSpyRail';
import { ExtrasGrid } from '../components/features/ExtrasGrid';
import { LimitsStrip } from '../components/features/LimitsStrip';
import { FinalCta } from '../components/features/FinalCta';
import { useHashScroll } from '../hooks/useHashScroll';

/** Small framed shot used inside the details accordions. */
const SubShot: React.FC<{ src: string; alt: string; caption: string }> = ({
  src,
  alt,
  caption,
}) => <ScreenFrame src={src} alt={alt} caption={caption} />;

export const Features: React.FC = () => {
  useHashScroll();

  return (
    <main>
      <FeaturesHero />
      <ScrollSpyRail />

      {/* 1 — Tasks */}
      <FeatureBlock
        {...TASKS}
        detailsExtra={
          <div className="pb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SubShot
              src="/media/v2/date_pick.webp"
              alt="The Dunzo date picker, with a text field that parses typed dates"
              caption="Date picker"
            />
            <SubShot
              src="/media/v2/time_pick.webp"
              alt="The Dunzo time picker, with a text field that parses typed times"
              caption="Time picker"
            />
            <div className="flex flex-col gap-4">
              <SubShot
                src="/media/v2/collection_pick_crop.webp"
                alt="The Dunzo collection picker, searching for a collection"
                caption="Collection picker"
              />
              <SubShot
                src="/media/v2/xp_pick.webp"
                alt="The Dunzo xp picker, can choose from 1-10 xp per task"
                caption="xp picker"
              />
            </div>
          </div>
        }
      >
        <ScreenFrame
          src="/media/v2/task_full.webp"
          alt="A Dunzo task open in full view, showing status, priority, dates, XP, collection and parent task"
          eager
        >
          {/* <div className="hidden sm:block absolute -bottom-8 -left-8 w-3/5 rounded-xl overflow-hidden ring-3 ring-surface bg-surface shadow-2xl">
            <img
              src="/media/s3.webp"
              alt="The Dunzo quick edit panel for a task"
              loading="lazy"
              decoding="async"
              className="block w-full h-auto"
            />
          </div> */}
        </ScreenFrame>
      </FeatureBlock>

      {/* 2 — Daily list */}
      <FeatureBlock {...DAILY} stacked>
        <ScreenFrame
          src="/media/s1.webp"
          alt="The Dunzo daily list page: time tracker widgets on the left, the day's tasks and week strip in the center, and a one-day calendar on the right"
        >
          <div className="hidden lg:block absolute -bottom-10 -left-10 w-3/5 rounded-xl overflow-hidden ring-3 ring-surface bg-surface shadow-2xl">
            <img
              src="/media/s3.webp"
              alt="The Dunzo quick edit panel for a task"
              loading="lazy"
              decoding="async"
              className="block w-full h-auto"
            />
          </div>
        </ScreenFrame>
      </FeatureBlock>

      {/* 3 — Planner */}
      <FeatureBlock
        {...PLANNER}
        reverse
        detailsExtra={
          <div className="pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2">
              <SubShot
                src="/media/s8.webp"
                alt="The planner's Filter menu, building a filter from field, condition and value"
                caption="Filters: and/or, field, condition, value"
              />
            </div>
            <SubShot
              src="/media/s9.webp"
              alt="Right-click context menu on a collection in the planner sidebar"
              caption="Collection context menu"
            />
            <SubShot
              src="/media/s7_crop.webp"
              alt="The planner's Fields menu, reordering and toggling columns"
              caption="Fields: order, visibility, word wrap"
            />
            
            {/* <SubShot
              src="/media/s5_collections.webp"
              alt="The collections list in the planner sidebar, nested by indentation"
              caption="Nested collections"
            /> */}
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <ScreenFrame
            src="/media/s5_crop.webp"
            alt="The Dunzo task planner in table view, with tasks nested under collection sections and columns for priority, dates, status and XP"
          />
          <div className="grid grid-cols-2 gap-4">
            <ScreenFrame
              src="/media/s6a_crop.webp"
              alt="The task planner grouped by status"
              caption="Grouped by status"
            />
            <ScreenFrame
              src="/media/s6b_crop.webp"
              alt="The task planner grouped by due date"
              caption="Grouped by date"
            />
          </div>
        </div>
      </FeatureBlock>

      {/* 4 — Calendar */}
      <FeatureBlock {...CALENDAR}>
        <ScreenFrame
          src="/media/s10_crop.webp"
          alt="The Dunzo calendar page, with tasks laid out as blocks across several days"
        >
          <div className="hidden lg:block absolute -bottom-11 -left-7 w-[20%] rounded-xl overflow-hidden ring-3 ring-surface bg-surface shadow-2xl">
            <img
              src="/media/s11.webp"
              alt="The calendar sidebar, with some collections toggled off"
              loading="lazy"
              decoding="async"
              className="block w-full h-auto"
            />
          </div>
        </ScreenFrame>
      </FeatureBlock>

      {/* 5 — XP & streaks */}
      <FeatureBlock {...XP} stacked>
        <div className="flex flex-col gap-10">
          {/* The three bar states read as a progression, so they stack. */}
          <div className="flex flex-col gap-3 max-w-4xl mx-auto w-full">
            <ScreenFrame
              src="/media/s12a.webp"
              alt="The XP bar partway to the day's target"
              caption="Working toward yesterday's XP"
            />
            <ScreenFrame
              src="/media/s12b.webp"
              alt="The XP bar full and gold, having matched yesterday's XP"
              caption="Target met — the bar turns gold"
            />
            <ScreenFrame
              src="/media/s12c.webp"
              alt="The XP bar in violet after beating the seven day best"
              caption="Best day — violet"
            />
          </div>

          <div className="max-w-md mx-auto w-full">
            <ScreenFrame
              src="/media/s13.webp"
              alt="The three daily stars and the streak badge"
              caption="Two stars holds the streak, three grows it"
            />
          </div>

          <ScreenFrame
            src="/media/s14.webp"
            alt="The Dunzo stats page: current streak, XP totals for the last 7, 30 and 365 days, and an XP history chart"
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ScreenFrame
              src="/media/s14a.webp"
              alt="Comparison cards for the last 7, 30 and 365 days against the previous period"
              caption="7 / 30 / 365 day comparisons"
            />
            <ScreenFrame
              src="/media/s14b.webp"
              alt="A breakdown of XP earned by collection over the last 30 days"
              caption="XP by collection"
            />
          </div>
        </div>
      </FeatureBlock>

      {/* 6 — Time widgets & focus */}
      <FeatureBlock {...FOCUS} stacked>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-6 items-start">
          <ScreenFrame
            src="/media/s15.webp"
            alt="The Dunzo time widgets page, with progress widgets for the day, a project and the year"
            caption="Time widgets"
          >
            <div className="hidden lg:block absolute -bottom-12 -right-5 w-[27%] rounded-xl overflow-hidden ring-3 ring-surface bg-surface shadow-2xl">
              <img
                src="/media/s15b.webp"
                alt="The widget editor, showing interval, color and value options"
                loading="lazy"
                decoding="async"
                className="block w-full h-auto"
              />
            </div>
          </ScreenFrame>

          <ScreenFrame
            src="/media/s16.webp"
            alt="The focus tool fullscreen in Pomodoro mode, showing the phase selector, countdown and cycle dots"
            caption="Fullscreen Pomodoro"
          >
            <div className="hidden lg:block absolute -bottom-12 -left-7 w-[42%] rounded-xl overflow-hidden ring-3 ring-surface bg-surface shadow-2xl">
              <img
                src="/media/s16b.webp"
                alt="The minimized focus card floating over the app"
                loading="lazy"
                decoding="async"
                className="block w-full h-auto"
              />
            </div>
          </ScreenFrame>
        </div>
      </FeatureBlock>

      {/* 7 — Task finder */}
      <FeatureBlock {...FINDER} stacked>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <ScreenFrame
            src="/media/s17.webp"
            alt="The Dunzo task finder in list mode, searching across all unarchived tasks"
            caption="List mode"
          />
          <ScreenFrame
            src="/media/s17b.webp"
            alt="The task finder in two-pane mode, filtering search results by collection"
            caption="Two-pane mode"
          />
        </div>
      </FeatureBlock>

      <ExtrasGrid />
      {/* <LimitsStrip /> */}
      <FinalCta />
    </main>
  );
};
