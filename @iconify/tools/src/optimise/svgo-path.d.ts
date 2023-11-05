declare module 'svgo/lib/path.js' {
	export function stringifyPathData(options: {
		pathData: Array<PathDataItem>;
		precision?: number;
		disableSpaceAfterFlags?: boolean;
	}): string; // Replace 'any' with the actual type if you know it
}
