import { optimize } from 'svgo';
import { stringifyPathData } from 'svgo/lib/path.js';
import type { Config, PluginConfig } from 'svgo';
import type { PathDataItem, Visitor } from 'svgo/lib/types';
import type { SVG } from '../svg';
import { replaceIDs } from '@iconify/utils/lib/svg/id';

interface CleanupIDsOption {
	// Cleanup IDs, value is prefix to add to IDs, default is 'svgID'. False to disable it
	// Do not use dashes in ID, it breaks some SVG animations
	cleanupIDs?: string | ((id: string) => string) | false;
}

interface GetSVGOPluginOptions extends CleanupIDsOption {
	animated?: boolean;
	keepShapes?: boolean;
}

/**
 * Get list of plugins
 */
export function getSVGOPlugins(options: GetSVGOPluginOptions): PluginConfig[] {
	const processPath: Visitor = {
		element: {
			enter(element) {
				const path =
					'pathJS' in element && (element.pathJS as PathDataItem[]);
				if (!path) return;

				const start = [0, 0];
				const cursor = [0, 0];

				for (let i = 0; i < path.length; i += 1) {
					const pathItem = path[i];
					const { command, args } = pathItem;

					// moveto (x y)
					if (command === 'm') {
						cursor[0] += args[0];
						cursor[1] += args[1];
						start[0] = cursor[0];
						start[1] = cursor[1];
					}
					if (command === 'M') {
						cursor[0] = args[0];
						cursor[1] = args[1];
						start[0] = cursor[0];
						start[1] = cursor[1];
					}

					// lineto (x y)
					if (command === 'l') {
						cursor[0] += args[0];
						cursor[1] += args[1];
					}
					if (command === 'L') {
						cursor[0] = args[0];
						cursor[1] = args[1];
					}

					// horizontal lineto (x)
					if (command === 'h') {
						cursor[0] += args[0];
					}
					if (command === 'H') {
						cursor[0] = args[0];
					}

					// vertical lineto (y)
					if (command === 'v') {
						cursor[1] += args[0];
					}
					if (command === 'V') {
						cursor[1] = args[0];
					}

					if (['l', 'L', 'h', 'H', 'v', 'V'].includes(command)) {
						if (start[0] == cursor[0] && start[1] == cursor[1])
							path[i] = { command: 'z', args: [] };
					}

					// curveto (x1 y1 x2 y2 x y)
					if (command === 'c') {
						cursor[0] += args[4];
						cursor[1] += args[5];
					}
					if (command === 'C') {
						cursor[0] = args[4];
						cursor[1] = args[5];
					}

					// smooth curveto (x2 y2 x y)
					if (command === 's') {
						cursor[0] += args[2];
						cursor[1] += args[3];
					}
					if (command === 'S') {
						cursor[0] = args[2];
						cursor[1] = args[3];
					}

					// quadratic Bézier curveto (x1 y1 x y)
					if (command === 'q') {
						cursor[0] += args[2];
						cursor[1] += args[3];
					}
					if (command === 'Q') {
						cursor[0] = args[2];
						cursor[1] = args[3];
					}

					// smooth quadratic Bézier curveto (x y)
					if (command === 't') {
						cursor[0] += args[0];
						cursor[1] += args[1];
					}
					if (command === 'T') {
						cursor[0] = args[0];
						cursor[1] = args[1];
					}

					// elliptical arc (rx ry x-axis-rotation large-arc-flag sweep-flag x y)
					if (command === 'a') {
						cursor[0] += args[5];
						cursor[1] += args[6];
					}
					if (command === 'A') {
						cursor[0] = args[5];
						cursor[1] = args[6];
					}

					// closepath
					if (command === 'Z' || command === 'z') {
						// reset cursor
						cursor[0] = start[0];
						cursor[1] = start[1];
					}
				}
				element.attributes.d = stringifyPathData({
					pathData: path,
				});
			},
		},
	};
	return [
		'cleanupAttrs',
		'mergeStyles',
		'inlineStyles',
		'removeComments',
		'removeUselessDefs',
		'removeEditorsNSData',
		'removeEmptyAttrs',
		'removeEmptyContainers',
		'convertStyleToAttrs',
		'convertColors',
		'convertTransform',
		'removeUnknownsAndDefaults',
		'removeNonInheritableGroupAttrs',
		'removeUnusedNS',
		'cleanupNumericValues',
		'cleanupListOfValues',
		'moveElemsAttrsToGroup',
		'moveGroupAttrsToElems',
		'collapseGroups',
		'sortDefsChildren',
		'sortAttrs',

		// Plugins that are bugged when using animations
		...((options.animated
			? []
			: ['removeUselessStrokeAndFill']) as PluginConfig[]),

		// Plugins that modify shapes or are bugged when using animations
		...((options.animated || options.keepShapes
			? []
			: [
					'removeHiddenElems',
					'convertShapeToPath',
					'convertEllipseToCircle',
					{
						name: 'convertPathData',
						params: {
							noSpaceAfterFlags: true,
						},
					},
					{
						name: 'mergePaths',
						params: {
							noSpaceAfterFlags: true,
						},
					},
					// 'removeOffCanvasPaths', // bugged for some icons
					'reusePaths',
					{
						name: 'fixZ',
						fn: () => processPath,
					},
			  ]) as PluginConfig[]),

		// Clean up IDs, first run
		// Sometimes bugs out on animated icons. Do not use with animations!
		...((!options.animated && options.cleanupIDs !== false
			? ['cleanupIds']
			: []) as PluginConfig[]),
	];
}

/**
 * Options
 */
interface SVGOCommonOptions {
	// Parse SVG multiple times for better optimisation
	multipass?: boolean;
}

// Options list with custom plugins list
interface SVGOOptionsWithPlugin extends SVGOCommonOptions {
	// Custom SVGO plugins list
	plugins: PluginConfig[];
}

// Options list without plugins list
interface SVGOptionsWithoutPlugin extends SVGOCommonOptions, CleanupIDsOption {
	plugins?: undefined;

	// Keep shapes: doesn't run plugins that mess with shapes
	keepShapes?: boolean;
}

type SVGOOptions = SVGOOptionsWithPlugin | SVGOptionsWithoutPlugin;

/**
 * Run SVGO on icon
 */
export function runSVGO(svg: SVG, options: SVGOOptions = {}) {
	// Code
	const code = svg.toString();

	// Options
	const multipass = options.multipass !== false;

	// Plugins list
	let plugins: PluginConfig[];
	if (options.plugins) {
		plugins = options.plugins;
	} else {
		// Check for animations: convertShapeToPath and removeHiddenElems plugins currently might ruin animations
		const animated =
			code.indexOf('<animate') !== -1 || code.indexOf('<set') !== -1;

		plugins = getSVGOPlugins({
			...options,
			animated,
		});

		// Check for moveElemsAttrsToGroup bug: https://github.com/svg/svgo/issues/1752
		if (code.includes('filter=') && code.includes('transform=')) {
			plugins = plugins.filter(
				(item) => item !== 'moveElemsAttrsToGroup'
			);
		}
	}

	// Run SVGO
	const pluginOptions: Config = {
		plugins,
		multipass,
	};

	// Load data (changing type because SVGO types do not include error ?????)
	const result = optimize(code, pluginOptions) as unknown as Record<
		string,
		string
	>;
	if (typeof result.error === 'string') {
		throw new Error(result.error);
	}

	// Sometimes empty definitions are not removed: remove them
	let content = result.data.replace(/<defs\/>/g, '');

	// Replace IDs, but only if plugins list is not set
	if (!options.plugins) {
		const prefix =
			options.cleanupIDs !== void 0 ? options.cleanupIDs : 'svgID';
		if (prefix !== false) {
			let counter = 0;
			content = replaceIDs(
				content,
				typeof prefix === 'string'
					? () => {
							// Return prefix with number
							return prefix + (counter++).toString(36);
					  }
					: prefix
			);
		}
	}

	// Fix reusePaths result
	if (
		!options.plugins ||
		options.plugins.find((item) => {
			if (typeof item === 'string') {
				return item === 'reusePaths';
			}
			return item.name === 'reusePaths';
		})
	) {
		content = content
			.replace(' xmlns:xlink="http://www.w3.org/1999/xlink"', '')
			.replaceAll('xlink:href=', 'href=');
	}

	// Load content
	svg.load(content);
}
