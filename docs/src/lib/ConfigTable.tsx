import schema from "../../../sequoia.schema.json" with { type: "json" };

type PropertyInfo = {
	path: string;
	type: string;
	required: boolean;
	default?: string | number | boolean;
	description?: string;
};

function extractProperties(
	properties: Record<string, unknown>,
	required: string[],
	parentPath: string,
	result: PropertyInfo[],
): void {
	for (const [key, value] of Object.entries(properties)) {
		const prop = value as Record<string, unknown>;
		const fullPath = parentPath ? `${parentPath}.${key}` : key;
		const isRequired = required.includes(key);

		if (prop.properties) {
			extractProperties(
				prop.properties as Record<string, unknown>,
				(prop.required as string[]) || [],
				fullPath,
				result,
			);
		} else {
			result.push({
				path: fullPath,
				type: prop.type,
				required: isRequired,
				default: prop.default,
				description: prop.description,
			} as PropertyInfo);
		}
	}
}

export default function ConfigTable() {
	const rows: PropertyInfo[] = [];
	extractProperties(
		schema.properties as Record<string, unknown>,
		schema.required as string[],
		"",
		rows,
	);

	return (
		<table className="vocs_Table">
			<thead>
				<tr className="vocs_TableRow">
					<th className="vocs_TableHeader">Field</th>
					<th className="vocs_TableHeader">Type</th>
					<th className="vocs_TableHeader">Required</th>
					<th className="vocs_TableHeader">Default</th>
					<th className="vocs_TableHeader">Description</th>
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.path} className="vocs_TableRow">
						<td className="vocs_TableCell">
							<code className="vocs_Code">{row.path}</code>
						</td>
						<td className="vocs_TableCell">
							<code className="vocs_Code">{row.type}</code>
						</td>
						<td className="vocs_TableCell">{row.required ? "Yes" : ""}</td>
						<td className="vocs_TableCell">
							{row.default === undefined ? (
								"-"
							) : (
								<code className="vocs_Code">
									{typeof row.default === "string"
										? `"${row.default}"`
										: `${row.default}`}
								</code>
							)}
						</td>
						<td className="vocs_TableCell">{row.description || "—"}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}
