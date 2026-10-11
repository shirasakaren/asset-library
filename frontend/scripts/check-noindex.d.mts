export function checkNoindex(root: string): {
  bad: { file: string; robots: string[] }[];
  total: number;
};
