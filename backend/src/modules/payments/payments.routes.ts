import { Router } from "express";
import { z } from "zod";
import { db } from "../../config/firebase.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { requireHostelAccess } from "../../middleware/hostel-access.middleware.js";

const router=Router();
const schema=z.object({renterId:z.string().min(1),feeId:z.string().optional(),amountPaise:z.number().int().positive(),paidAt:z.string().optional(),method:z.enum(["CASH","UPI","BANK_TRANSFER","OTHER"]),reference:z.string().max(200).optional(),notes:z.string().max(1000).optional()});

router.post("/:hostelId/payments",requireAuth,requireHostelAccess,async(req,res,next)=>{
 try{
  if(!["SUPER_ADMIN","ADMIN","PARTNER"].includes(req.authUser!.role)){res.status(403).json({message:"Access denied"});return;}
  const p=schema.safeParse(req.body);if(!p.success){res.status(400).json({message:"Invalid payment data",errors:p.error.flatten()});return;}
  const renter=await db.collection("renters").doc(p.data.renterId).get();if(!renter.exists||renter.data()?.hostelId!==req.params.hostelId){res.status(400).json({message:"Renter not found in hostel"});return;}
  if(p.data.feeId){const fee=await db.collection("fees").doc(p.data.feeId).get();if(!fee.exists||fee.data()?.hostelId!==req.params.hostelId){res.status(400).json({message:"Fee not found in hostel"});return;}}
  const ref=db.collection("payments").doc();const payment={id:ref.id,hostelId:req.params.hostelId as string,recordedById:req.authUser!.id,...p.data,paidAt:p.data.paidAt??new Date().toISOString(),createdAt:new Date().toISOString()};await ref.set(payment);
  res.status(201).json({message:"Payment recorded successfully",payment});
 }catch(e){next(e);}
});

router.get("/:hostelId/payments",requireAuth,requireHostelAccess,async(req,res,next)=>{
 try{const snap=await db.collection("payments").where("hostelId","==",req.params.hostelId).get();res.json({payments:snap.docs.map(d=>({id:d.id,...d.data()}))});}catch(e){next(e);}
});
export default router;
