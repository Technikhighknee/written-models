import { profileSpans } from "../../shapes/profiles/profileSpans";
import type { ProfileSpansOptions } from "../../shapes/profiles/profileSpans";
import { mirrorStations } from "../../shapes/profiles/mirrorStations";
import { axialProfileSolid } from "../build/axialProfileSolid";
import type { LoftAxialProfileOptions } from "./loftAxialProfile";
import type { GeometryResult } from "../kernel/GeometryResult";

export interface ProfiledSolidOptions
    extends Omit<LoftAxialProfileOptions, "stations"> {
    profile: ProfileSpansOptions;
    mirrorAround?: number;
}

/** Compose authored profile spans into an owned, capped geometry result. */
export function profiledSolid({
    profile, mirrorAround, ...options
}: ProfiledSolidOptions): GeometryResult {
    const authored = profileSpans(profile);
    const stations = mirrorAround === undefined
        ? authored : mirrorStations(authored, mirrorAround);

    return axialProfileSolid({...options, stations});
}
