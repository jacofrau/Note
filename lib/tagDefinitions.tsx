"use client";

import { InstagramIcon } from "@/components/AppIcons";
import type { ReactNode } from "react";

type TagIconProps = {
  className?: string;
};

type TagDefinition = {
  terms: string[];
  renderIcon: (props: TagIconProps) => ReactNode;
};

function normalizeTagTerm(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("it-IT");
}

function getSortedUniqueTerms(terms: string[]): string[] {
  const uniqueTerms = new Map<string, string>();

  for (const term of terms) {
    const normalized = normalizeTagTerm(term);
    if (!normalized || uniqueTerms.has(normalized)) continue;
    uniqueTerms.set(normalized, term);
  }

  return [...uniqueTerms.values()].sort((a, b) => a.localeCompare(b, "it-IT", { sensitivity: "base" }));
}

function PlaneTagIcon({ className }: TagIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19.3074 7.63582C19.3074 7.63582 20.4246 5.92462 19.364 4.86396C18.3033 3.8033 16.5921 4.92053 16.5921 4.92053L13.0566 8.45606L5.45753 6.04247L3.57191 7.92809L9.75674 11.7559L7.87112 13.6415L4.40158 13.9432L3.69448 14.6503L7.34315 16.8848L9.60589 20.5617L10.313 19.8546L10.5864 16.3568L12.472 14.4712L16.2998 20.656L18.1854 18.7704L15.7719 11.1714L19.3074 7.63582Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChefHatTagIcon({ className }: TagIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M19 18H19.75H19ZM5 14.584H5.75C5.75 14.2859 5.57345 14.016 5.30028 13.8967L5 14.584ZM19 14.584L18.6997 13.8967C18.4265 14.016 18.25 14.2859 18.25 14.584H19ZM15.75 7C15.75 7.41421 16.0858 7.75 16.5 7.75C16.9142 7.75 17.25 7.41421 17.25 7H15.75ZM6.75 7C6.75 7.41421 7.08579 7.75 7.5 7.75C7.91421 7.75 8.25 7.41421 8.25 7H6.75ZM7 4.25C3.82436 4.25 1.25 6.82436 1.25 10H2.75C2.75 7.65279 4.65279 5.75 7 5.75V4.25ZM17 5.75C19.3472 5.75 21.25 7.65279 21.25 10H22.75C22.75 6.82436 20.1756 4.25 17 4.25V5.75ZM15 21.25H9V22.75H15V21.25ZM9 21.25C8.03599 21.25 7.38843 21.2484 6.90539 21.1835C6.44393 21.1214 6.24643 21.0142 6.11612 20.8839L5.05546 21.9445C5.51093 22.4 6.07773 22.5857 6.70552 22.6701C7.31174 22.7516 8.07839 22.75 9 22.75V21.25ZM4.25 18C4.25 18.9216 4.24841 19.6883 4.32991 20.2945C4.41432 20.9223 4.59999 21.4891 5.05546 21.9445L6.11612 20.8839C5.9858 20.7536 5.87858 20.5561 5.81654 20.0946C5.75159 19.6116 5.75 18.964 5.75 18H4.25ZM18.25 18C18.25 18.964 18.2484 19.6116 18.1835 20.0946C18.1214 20.5561 18.0142 20.7536 17.8839 20.8839L18.9445 21.9445C19.4 21.4891 19.5857 20.9223 19.6701 20.2945C19.7516 19.6883 19.75 18.9216 19.75 18H18.25ZM15 22.75C15.9216 22.75 16.6883 22.7516 17.2945 22.6701C17.9223 22.5857 18.4891 22.4 18.9445 21.9445L17.8839 20.8839C17.7536 21.0142 17.5561 21.1214 17.0946 21.1835C16.6116 21.2484 15.964 21.25 15 21.25V22.75ZM7 5.75C7.2137 5.75 7.42326 5.76571 7.6277 5.79593L7.84703 4.31205C7.57021 4.27114 7.28734 4.25 7 4.25V5.75ZM12 1.25C9.68949 1.25 7.72942 2.7421 7.02709 4.81312L8.44763 5.29486C8.94981 3.81402 10.3516 2.75 12 2.75V1.25ZM7.02709 4.81312C6.84722 5.34352 6.75 5.91118 6.75 6.5H8.25C8.25 6.07715 8.3197 5.67212 8.44763 5.29486L7.02709 4.81312ZM17 4.25C16.7127 4.25 16.4298 4.27114 16.153 4.31205L16.3723 5.79593C16.5767 5.76571 16.7863 5.75 17 5.75V4.25ZM12 2.75C13.6484 2.75 15.0502 3.81402 15.5524 5.29486L16.9729 4.81312C16.2706 2.7421 14.3105 1.25 12 1.25V2.75ZM15.5524 5.29486C15.6803 5.67212 15.75 6.07715 15.75 6.5H17.25C17.25 5.91118 17.1528 5.34352 16.9729 4.81312L15.5524 5.29486ZM5.75 18V14.584H4.25V18H5.75ZM5.30028 13.8967C3.79769 13.2402 2.75 11.7416 2.75 10H1.25C1.25 12.359 2.6705 14.3846 4.69972 15.2712L5.30028 13.8967ZM18.25 14.584L18.25 18H19.75L19.75 14.584H18.25ZM21.25 10C21.25 11.7416 20.2023 13.2402 18.6997 13.8967L19.3003 15.2712C21.3295 14.3846 22.75 12.359 22.75 10H21.25ZM15.75 6.5V7H17.25V6.5H15.75ZM6.75 6.5V7H8.25V6.5H6.75Z"
        fill="currentColor"
      />
      <path d="M9 18H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SchoolTagIcon({ className }: TagIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 10L12 5L3 10L6 11.6667M21 10L18 11.6667M21 10C21.6129 10.3064 22 10.9328 22 11.618V16.9998M6 11.6667L12 15L18 11.6667M6 11.6667V17.6667L12 21L18 17.6667V11.6667"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NotesTagIcon({ className }: TagIconProps) {
  return (
    <svg className={className} viewBox="0 0 25 25" fill="none" aria-hidden="true">
      <path
        d="M13.2942 7.95881C13.5533 7.63559 13.5013 7.16358 13.178 6.90453C12.8548 6.64549 12.3828 6.6975 12.1238 7.02072ZM6.811 14.8488L7.37903 15.3385C7.38489 15.3317 7.39062 15.3248 7.39623 15.3178ZM6.64 15.2668L5.89146 15.2179L5.8908 15.2321ZM6.5 18.2898L5.7508 18.2551C5.74908 18.2923 5.75013 18.3296 5.75396 18.3667ZM7.287 18.9768L7.31152 19.7264C7.36154 19.7247 7.41126 19.7181 7.45996 19.7065ZM10.287 18.2658L10.46 18.9956L10.4716 18.9927ZM10.672 18.0218L11.2506 18.4991L11.2571 18.491ZM17.2971 10.959C17.5562 10.6358 17.5043 10.1638 17.1812 9.90466C16.8581 9.64552 16.386 9.69742 16.1269 10.0206ZM12.1269 7.02052C11.8678 7.34365 11.9196 7.81568 12.2428 8.07484C12.5659 8.33399 13.0379 8.28213 13.2971 7.95901ZM14.3 5.50976L14.8851 5.97901C14.8949 5.96672 14.9044 5.95412 14.9135 5.94123ZM15.929 5.18976L16.4088 4.61332C16.3849 4.59344 16.3598 4.57507 16.3337 4.5583ZM18.166 7.05176L18.6968 6.52192C18.6805 6.50561 18.6635 6.49007 18.6458 6.47532ZM18.5029 7.87264L19.2529 7.87676ZM18.157 8.68976L17.632 8.15412C17.6108 8.17496 17.5908 8.19704 17.5721 8.22025ZM16.1271 10.0203C15.8678 10.3433 15.9195 10.8153 16.2425 11.0746C16.5655 11.3339 17.0376 11.2823 17.2969 10.9593ZM13.4537 7.37862C13.3923 6.96898 13.0105 6.68666 12.6009 6.74805C12.1912 6.80943 11.9089 7.19127 11.9703 7.60091ZM16.813 11.2329C17.2234 11.1772 17.5109 10.7992 17.4552 10.3888C17.3994 9.97834 17.0215 9.69082 16.611 9.74659ZM12.1238 7.02072L6.22577 14.3797L7.39623 15.3178L13.2942 7.95881ZM6.24297 14.359C6.03561 14.5995 5.91226 14.9011 5.89159 15.218L7.38841 15.3156C7.38786 15.324 7.38457 15.3321 7.37903 15.3385ZM5.8908 15.2321L5.7508 18.2551L7.2492 18.3245L7.3892 15.3015ZM5.75396 18.3667C5.83563 19.1586 6.51588 19.7524 7.31152 19.7264L7.26248 18.2272C7.25928 18.2273 7.25771 18.2268 7.25669 18.2264C7.25526 18.2259 7.25337 18.2249 7.25144 18.2232C7.2495 18.2215 7.24825 18.2198 7.24754 18.2185C7.24703 18.2175 7.24637 18.216 7.24604 18.2128ZM7.45996 19.7065L10.46 18.9955L10.114 17.536L7.11404 18.247ZM10.4716 18.9927C10.7771 18.9151 11.05 18.7422 11.2506 18.499L10.0934 17.5445C10.0958 17.5417 10.0989 17.5397 10.1024 17.5388ZM11.2571 18.491L17.2971 10.959L16.1269 10.0206L10.0869 17.5526ZM13.2971 7.95901L14.8851 5.97901L13.7149 5.04052L12.1269 7.02052ZM14.9135 5.94123C15.0521 5.74411 15.3214 5.6912 15.5243 5.82123L16.3337 4.5583C15.4544 3.99484 14.2873 4.2241 13.6865 5.0783ZM15.4492 5.7662L17.6862 7.6282L18.6458 6.47532L16.4088 4.61332ZM17.6352 7.58161C17.7111 7.6577 17.7535 7.761 17.7529 7.86852L19.2529 7.87676C19.2557 7.36905 19.0555 6.88127 18.6968 6.52192ZM17.7529 7.86852C17.7524 7.97604 17.7088 8.07886 17.632 8.15412L18.682 9.22541C19.0446 8.87002 19.2501 8.38447 19.2529 7.87676ZM17.5721 8.22025L16.1271 10.0203L17.2969 10.9593L18.7419 9.15928ZM11.9703 7.60091C12.3196 9.93221 14.4771 11.5503 16.813 11.2329L16.611 9.74659C15.0881 9.95352 13.6815 8.89855 13.4537 7.37862Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GiftTagIcon({ className }: TagIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 9.5C3 9.03534 3 8.80302 3.03843 8.60982C3.19624 7.81644 3.81644 7.19624 4.60982 7.03843C4.80302 7 5.03534 7 5.5 7H12H18.5C18.9647 7 19.197 7 19.3902 7.03843C20.1836 7.19624 20.8038 7.81644 20.9616 8.60982C21 8.80302 21 9.03534 21 9.5C21 9.96466 21 10.197 20.9616 10.3902C20.8038 11.1836 20.1836 11.8038 19.3902 11.9616C19.197 12 18.9647 12 18.5 12H12H5.5C5.03534 12 4.80302 12 4.60982 11.9616C3.81644 11.8038 3.19624 11.1836 3.03843 10.3902C3 10.197 3 9.96466 3 9.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M4 12V16C4 17.8856 4 18.8284 4.58579 19.4142C5.17157 20 6.11438 20 8 20H9H15H16C17.8856 20 18.8284 20 19.4142 19.4142C20 18.8284 20 17.8856 20 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.3753 6.21913L9.3959 3.74487C8.65125 2.81406 7.26102 2.73898 6.41813 3.58187C5.1582 4.8418 6.04662 7 7.82843 7L11 7C11.403 7 11.6271 6.53383 11.3753 6.21913Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.6247 6.21913L14.6041 3.74487C15.3488 2.81406 16.739 2.73898 17.5819 3.58187C18.8418 4.8418 17.9534 7 16.1716 7L13 7C12.597 7 12.3729 6.53383 12.6247 6.21913Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PetTagIcon({ className }: TagIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.41003 16.75C4.17003 19.64 6.35003 22 9.25003 22H14.04C17.3 22 19.54 19.37 19 16.15C18.43 12.77 15.17 10 11.74 10C8.02003 10 4.72003 13.04 4.41003 16.75Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.47 7.5C11.8507 7.5 12.97 6.38071 12.97 5C12.97 3.61929 11.8507 2.5 10.47 2.5C9.08926 2.5 7.96997 3.61929 7.96997 5C7.96997 6.38071 9.08926 7.5 10.47 7.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.3 8.69995C18.4046 8.69995 19.3 7.80452 19.3 6.69995C19.3 5.59538 18.4046 4.69995 17.3 4.69995C16.1955 4.69995 15.3 5.59538 15.3 6.69995C15.3 7.80452 16.1955 8.69995 17.3 8.69995Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12.7C21.8284 12.7 22.5 12.0284 22.5 11.2C22.5 10.3715 21.8284 9.69995 21 9.69995C20.1716 9.69995 19.5 10.3715 19.5 11.2C19.5 12.0284 20.1716 12.7 21 12.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.96997 10.7C5.07454 10.7 5.96997 9.80452 5.96997 8.69995C5.96997 7.59538 5.07454 6.69995 3.96997 6.69995C2.8654 6.69995 1.96997 7.59538 1.96997 8.69995C1.96997 9.80452 2.8654 10.7 3.96997 10.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WorkTagIcon({ className }: TagIconProps) {
  return (
    <svg className={className} viewBox="0 0 512 512" fill="none" aria-hidden="true">
      <g transform="translate(42.666667, 64)">
        <path
          d="M277.333333 0L298.666667 21.3333333L298.666 64L426.666667 64L426.666667 362.666667L0 362.666667L0 64L128 64L128 21.3333333L149.333333 0L277.333333 0ZM42.6664912 220.935181L42.6666667 320L384 320L384.000468 220.935097C341.375319 233.130501 298.701692 240.759085 256.000479 243.809455L256 277.333333L170.666667 277.333333L170.666323 243.809465C127.965163 240.759108 85.2915887 233.130549 42.6664912 220.935181ZM384 106.666667L42.6666667 106.666667L42.6668606 176.433085C99.6386775 193.933257 156.507113 202.666667 213.333333 202.666667C270.159803 202.666667 327.028489 193.933181 384.000558 176.432854L384 106.666667ZM256 42.6666667L170.666667 42.6666667L170.666667 64L256 64L256 42.6666667Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}

function DevTagIcon({ className }: TagIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 7L4 12L8 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 7L20 12L16 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13.5 5L10.5 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const TAG_DEFINITIONS: TagDefinition[] = [
  {
    terms: ["travel", "viaggi", "viaggio"],
    renderIcon: (props) => <PlaneTagIcon {...props} />,
  },
  {
    terms: ["cook", "cucina", "ricette", "ricetta", "chef"],
    renderIcon: (props) => <ChefHatTagIcon {...props} />,
  },
  {
    terms: ["uni", "universita", "università", "university", "scuola", "school"],
    renderIcon: (props) => <SchoolTagIcon {...props} />,
  },
  {
    terms: ["appunti", "appunto", "riassunti", "riassunto", "studio"],
    renderIcon: (props) => <NotesTagIcon {...props} />,
  },
  {
    terms: ["gift", "regali", "regalo"],
    renderIcon: (props) => <GiftTagIcon {...props} />,
  },
  {
    terms: ["animali", "animale", "pet", "cane", "gatto"],
    renderIcon: (props) => <PetTagIcon {...props} />,
  },
  {
    terms: ["work", "lavoro", "job"],
    renderIcon: (props) => <WorkTagIcon {...props} />,
  },
  {
    terms: ["dev", "development", "programming", "coding", "code", "codes"],
    renderIcon: (props) => <DevTagIcon {...props} />,
  },
  {
    terms: ["insta", "instagram"],
    renderIcon: (props) => <InstagramIcon {...props} />,
  },
];

export function getTagDefinition(tag: string | null | undefined): TagDefinition | null {
  if (!tag) return null;
  const normalized = normalizeTagTerm(tag);
  return TAG_DEFINITIONS.find((definition) => definition.terms.includes(normalized)) ?? null;
}

export function getTagIcon(tag: string | null | undefined, className?: string): ReactNode {
  const definition = getTagDefinition(tag);
  if (!definition) return null;
  return definition.renderIcon({ className });
}

export function getCustomTagLegendGroups(): Array<{
  key: string;
  terms: string[];
  renderIcon: TagDefinition["renderIcon"];
}> {
  return TAG_DEFINITIONS
    .map((definition, index) => {
      const sortedTerms = getSortedUniqueTerms(definition.terms);

      return {
        key: sortedTerms[0] ?? `tag-${index}`,
        terms: sortedTerms,
        renderIcon: definition.renderIcon,
      };
    })
    .sort((a, b) => (a.terms[0] ?? "").localeCompare(b.terms[0] ?? "", "it-IT", { sensitivity: "base" }));
}
