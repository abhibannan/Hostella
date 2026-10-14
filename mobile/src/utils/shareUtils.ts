import { Share } from "react-native";
import { Renter, Hostel } from "../types";
import { getName } from "./formatters";

export async function shareRenterDetails(renter: Renter, hostel?: Hostel | null): Promise<void> {
  const name = getName(renter);
  const room = renter.room?.roomNumber || "Unassigned Room";
  const phone = renter.phone || renter.user?.phone || "N/A";
  const rent = renter.monthlyFee ? `₹${renter.monthlyFee.toLocaleString()}` : "Not specified";
  const deposit = renter.securityDeposit ? `₹${renter.securityDeposit.toLocaleString()}` : "Not specified";
  const joined = renter.joiningDate ? new Date(renter.joiningDate).toLocaleDateString() : "N/A";
  const propertyName = hostel?.name || "Hostella Resident";

  const message = [
    `📋 *Resident Profile — ${propertyName}*`,
    `──────────────────────`,
    `👤 *Name:* ${name}`,
    `🚪 *Room:* ${room}`,
    `📞 *Phone:* ${phone}`,
    `💰 *Monthly Rent:* ${rent}`,
    `🛡️ *Deposit:* ${deposit}`,
    `📅 *Move-in Date:* ${joined}`,
    `🏷️ *Status:* ${renter.status || "ACTIVE"}`,
    ...(renter.guardianName ? [`👥 *Guardian:* ${renter.guardianName} (${renter.guardianPhone || "N/A"})`] : []),
    `──────────────────────`,
    `Shared via Hostella Property Management`,
  ].join("\n");

  try {
    await Share.share({
      message,
      title: `Resident Profile - ${name}`,
    });
  } catch (err) {
    console.warn("Share failed:", err);
  }
}
