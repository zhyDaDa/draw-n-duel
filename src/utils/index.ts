export const randomInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};
export const deepCopy = <T>(obj: T): T => {
  const keyofObj = typeof obj;
  if (
    keyofObj === "string" ||
    keyofObj === "number" ||
    keyofObj === "boolean" ||
    obj === null ||
    obj === undefined
  ) {
    return obj;
  }
  if (keyofObj === "function") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepCopy(item)) as unknown as T;
  }
  if (keyofObj === "object") {
    const result: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result[key] = deepCopy((obj as any)[key]);
      }
      return result as T;
    }
  }
  throw new Error("Unable to copy object: " + obj);
};
export const shuffleString = (str: string): string => {
  const arr = str.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
};
