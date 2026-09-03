import { Box, Button, Link, Stack, Step, StepLabel, Stepper, Typography } from "@mui/material";
import React, { useEffect, useState } from "react";
import __ from "../../utils/i18n";
import { I18nStrings } from "../../utils/typed/i18n";
import { topicLoaders } from "../onboarding/topics";
import { OnboardingTopic } from "../onboarding/types";
import { BaseDialog } from "./common/BaseDialog";
import { ZoomableImage } from "./common/ZoomableImage";

export const OnboardingDialog: React.FC<{
    open: boolean;
    topic: string;
    onClose: () => void;
}> = ({ open, topic, onClose }) => {
    const [data, setData] = useState<OnboardingTopic | null>(null);
    const [step, setStep] = useState(0);

    useEffect(() => {
        setStep(0);
        const loader = topicLoaders[topic];
        if (!loader) {
            setData(null);
            return;
        }
        loader()
            .then((m) => setData(m.default))
            .catch(() => setData(null));
    }, [topic]);

    if (!data) return null;

    const current = data.steps[step];

    return (
        <BaseDialog
            open={open}
            onClose={onClose}
            title={__(data.titleKey)}
            maxWidth="md"
            fullWidth
            actions={
                <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Button disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                        {__(I18nStrings.BTN_BACK)}
                    </Button>
                    {step === data.steps.length - 1 ? (
                        <Button variant="contained" onClick={onClose}>
                            {__(I18nStrings.BTN_DONE)}
                        </Button>
                    ) : (
                        <Button variant="contained" onClick={() => setStep((s) => s + 1)}>
                            {__(I18nStrings.BTN_NEXT)}
                        </Button>
                    )}
                </Box>
            }
        >
            <Stack
                spacing={2}
                sx={{
                    alignItems: "center",
                }}
            >
                <Stepper activeStep={step} alternativeLabel sx={{ width: "100%" }}>
                    {data.steps.map((s, i) => (
                        <Step key={i}>
                            <StepLabel>{__(s.shortTitleKey)}</StepLabel>
                        </Step>
                    ))}
                </Stepper>
                {current.image && (
                    <ZoomableImage
                        src={current.image}
                        alt={__(current.titleKey)}
                        sx={{
                            width: "100%",
                            maxHeight: "50vh",
                            objectFit: "contain",
                            borderRadius: 1,
                            boxShadow: 1,
                        }}
                    />
                )}
                <Typography variant="h6">{__(current.titleKey)}</Typography>
                <Typography variant="body1">{__(current.descriptionKey)}</Typography>
                {(() => {
                    const link = current.link;
                    if (!link) return null;
                    return (
                        <Link
                            href={link.href}
                            onClick={(e) => {
                                e.preventDefault();
                                window.olsCore.openExternal(link.href);
                            }}
                        >
                            {__(link.textKey)}
                        </Link>
                    );
                })()}
            </Stack>
        </BaseDialog>
    );
};
