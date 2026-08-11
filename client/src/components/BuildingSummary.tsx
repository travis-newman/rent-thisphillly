import { Link } from "react-router-dom";
import type { Building } from "../lib/api";
import { getWebsiteHostname } from "./BuildingForms";

export function BuildingSummaryLine({ building }: { building: Building }) {
  const hostname = getWebsiteHostname(building.website);

  return (
    <>
      <strong>
        <Link to={`/buildings/${building._id}`}>{building.buildingName ?? building.address}</Link>
      </strong>
      {" — "}
      {building.address}
      {building.zipCode ? `, ${building.zipCode}` : ""}
      {building.numberOfUnits != null && <> · {building.numberOfUnits} units</>}
      {building.yearBuilt != null && <> · built {building.yearBuilt}</>}
      {building.leasingPhone && <> · {building.leasingPhone}</>}
      {building.leasingEmail && (
        <>
          {" · "}
          <a href={`mailto:${building.leasingEmail}`}>{building.leasingEmail}</a>
        </>
      )}
      {hostname && (
        <>
          {" · "}
          <a href={building.website!} target="_blank" rel="noreferrer">
            {hostname}
          </a>
        </>
      )}
    </>
  );
}
