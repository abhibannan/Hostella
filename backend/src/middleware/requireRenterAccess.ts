import type { NextFunction, Request, Response } from "express";
import { db } from "../config/firebase.js";

export async function requireRenterAccess(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.authUser) {
      res.status(401).json({
        message: "Hostella user profile required",
      });
      return;
    }

    const renterId = req.params.renterId;

    if (typeof renterId !== "string" || !renterId.trim()) {
      res.status(400).json({
        message: "Invalid renter ID",
      });
      return;
    }

    // Super Admin and Admin are already protected
    // by requireHostelAccess.
    if (
      req.authUser.role === "SUPER_ADMIN" ||
      req.authUser.role === "ADMIN"
    ) {
      next();
      return;
    }

    // Renter can access only their own renter document.
    if (req.authUser.role === "RENTER") {
      const renterSnapshot = await db
        .collection("renters")
        .doc(renterId)
        .get();

      if (!renterSnapshot.exists) {
        res.status(404).json({
          message: "Renter not found",
        });
        return;
      }

      const renterData = renterSnapshot.data();

      if (renterData?.userId !== req.authUser.id) {
        res.status(403).json({
          message: "You do not have access to this renter profile",
        });
        return;
      }

      if (renterData?.status !== "ACTIVE") {
        res.status(403).json({
          message: "Renter account is not active",
        });
        return;
      }

      next();
      return;
    }

    res.status(403).json({
      message: "Invalid user role",
    });
  } catch (error) {
    next(error);
  }
}