export type ModuleAccess = "fire" | "food" | "both";
export type NavigationModule = "fire" | "food" | "shared";

export function moduleAllowed(access: ModuleAccess, module: NavigationModule) {
  return module === "shared" || access === "both" || access === module;
}

export function defaultLanding(access: ModuleAccess) {
  return access === "food" ? "/food-hygiene" : "/";
}
