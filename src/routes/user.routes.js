import { Router } from "express";
import { resisterUser } from "../controllers/user.controller.js";

const router = Router();

router.route("/register").post(resisterUser);

export default router;
